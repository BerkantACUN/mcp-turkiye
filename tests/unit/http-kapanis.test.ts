import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpSunucusuOlustur, kapanisiKur, type Surec } from '../../src/http-sunucu.js';

/**
 * The HTTP entry's shutdown: in-process against a fake `process`, and once as
 * a real child process receiving a real SIGTERM.
 */
class SahteSurec extends EventEmitter implements Surec {
  readonly exit = vi.fn<(kod: number) => void>();
}

let sunucu: Server | undefined;

afterEach(async () => {
  if (!sunucu) return;
  sunucu.closeAllConnections();
  await new Promise((ok) => sunucu?.close(() => ok(undefined)));
  sunucu = undefined;
});

async function dinle(s: Server): Promise<number> {
  sunucu = s;
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  return (s.address() as AddressInfo).port;
}

/** A GET over a keep-alive agent; resolves with status and body. */
function al(port: number, yol: string): Promise<{ durum: number; govde: string }> {
  return new Promise((ok, hata) => {
    const istek = request({ host: '127.0.0.1', port, path: yol }, (res) => {
      let govde = '';
      res.on('data', (p) => {
        govde += p;
      });
      res.on('end', () => ok({ durum: res.statusCode ?? 0, govde }));
    });
    istek.on('error', hata);
    istek.end();
  });
}

const bekle = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

describe('kapanisiKur', () => {
  it('listens for SIGTERM and SIGINT only once each', () => {
    const surec = new SahteSurec();
    kapanisiKur(createServer(), surec);
    expect(surec.listenerCount('SIGTERM')).toBe(1);
    expect(surec.listenerCount('SIGINT')).toBe(1);
  });

  it('exits 0 at once when nothing is in flight', async () => {
    const surec = new SahteSurec();
    await dinle(httpSunucusuOlustur({ dakikaLimiti: 0, pencereMs: 60_000, proxyyeGuven: false }));
    kapanisiKur(sunucu as Server, surec);
    surec.emit('SIGTERM');
    await vi.waitFor(() => expect(surec.exit).toHaveBeenCalledWith(0));
  });

  it('drops idle keep-alive sockets instead of waiting for them to time out', async () => {
    const surec = new SahteSurec();
    const port = await dinle(
      httpSunucusuOlustur({ dakikaLimiti: 0, pencereMs: 60_000, proxyyeGuven: false }),
    );
    // Node's global agent keeps the socket open after this response.
    expect((await al(port, '/health')).durum).toBe(200);
    kapanisiKur(sunucu as Server, surec, 60_000);
    surec.emit('SIGTERM');
    await vi.waitFor(() => expect(surec.exit).toHaveBeenCalledWith(0));
  });

  it('lets an in-flight request finish, then exits; new connections are refused', async () => {
    const surec = new SahteSurec();
    let bitir: () => void = () => {};
    const port = await dinle(
      createServer((_req, res) => {
        bitir = () => res.end('tamam');
      }),
    );
    kapanisiKur(sunucu as Server, surec, 60_000);
    const suren = al(port, '/yavas');
    await vi.waitFor(() => expect(sunucu?.listening).toBe(true));
    await bekle(50);
    surec.emit('SIGINT');

    await expect(al(port, '/yeni')).rejects.toThrow();
    await bekle(50);
    expect(surec.exit).not.toHaveBeenCalled();

    bitir();
    expect(await suren).toEqual({ durum: 200, govde: 'tamam' });
    await vi.waitFor(() => expect(surec.exit).toHaveBeenCalledWith(0));
  });

  it('gives up on a request that never ends once the grace period is over', async () => {
    const surec = new SahteSurec();
    const port = await dinle(createServer(() => {}));
    kapanisiKur(sunucu as Server, surec, 100);
    al(port, '/asili').catch(() => {});
    await bekle(50);
    surec.emit('SIGTERM');
    await bekle(20);
    expect(surec.exit).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(surec.exit).toHaveBeenCalledWith(0), { timeout: 1_000 });
  });
});

// Windows has no POSIX signals: `kill('SIGTERM')` there terminates the child
// outright, so there is nothing graceful to observe.
describe.skipIf(process.platform === 'win32')('src/http.ts as a process', () => {
  it('starts, answers /health, and exits 0 on SIGTERM', async () => {
    const bos = createServer();
    await new Promise<void>((ok) => bos.listen(0, '127.0.0.1', ok));
    const port = (bos.address() as AddressInfo).port;
    await new Promise((ok) => bos.close(ok));

    const kok = join(__dirname, '..', '..');
    const cocuk = spawn(process.execPath, ['--import', 'tsx', join('src', 'http.ts')], {
      cwd: kok,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const bitti = new Promise<number | null>((ok) => cocuk.on('exit', (kod) => ok(kod)));
    try {
      await new Promise<void>((ok, hata) => {
        let cikti = '';
        cocuk.stderr.on('data', (p) => {
          cikti += p;
          if (cikti.includes('hazır')) ok();
        });
        cocuk.on('exit', () => hata(new Error(`çocuk süreç erken çıktı: ${cikti}`)));
      });
      expect((await al(port, '/health')).durum).toBe(200);
      cocuk.kill('SIGTERM');
      expect(await bitti).toBe(0);
    } finally {
      cocuk.kill('SIGKILL');
    }
  }, 20_000);
});
