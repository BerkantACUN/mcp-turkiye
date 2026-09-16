# Katkı: bir kaynak eklemek

Bir kaynak eklemek bir klasör eklemektir. Ölçüt tek: **kaynak buraya girmeden önce SOURCES.md'ye girmiş olmalı** — yayımlayan kurum, uç nokta, kullanım şartı, önbellek davranışı. Şartı yazılamayan kaynak eklenmez.

## 1. Kaynağı seçin

- Kamuya açık ve anahtarsız olsun; ücretsiz anahtarla çalışan bir kaynak ekleniyorsa anahtar isteğe bağlı olmalı ve anahtarsız araçlar etkilenmemeli.
- Kişisel veri işlemesin (bkz. [ACCEPTABLE_USE.md](ACCEPTABLE_USE.md)).
- Kullanım şartı kazımayı yasaklamasın.

## 2. Klasörü açın

```
src/sources/<id>/
  index.ts     # Kaynak nesnesi: id, ad, url, lisans, kaydet(server)
  parse.ts     # (varsa) saf ayrıştırıcı — ağ yok, sadece metin → nesne
tests/unit/<id>*.test.ts
tests/fixtures/<id>-*.{json,xml}   # gerçek yanıttan alınmış örnek
```

Sonra `src/sources/index.ts` içindeki `KAYNAKLAR` dizisine ekleyin. Araç adları `<id>_` ile başlar.

## 3. Kurallara uyun

- **Ağ yalnızca `src/core/http.ts` üzerinden.** `metinGetir` / `jsonGetir` zaman aşımı, yeniden deneme ve önbelleği verir; `fetch`'i doğrudan çağırmayın.
- **Ayrıştırıcı saf olsun** ve beklenmeyen biçimde **hata fırlatsın**; boş liste dönmesin. Bozulan kaynağı sessizce "veri yok" gibi göstermek en kötü sonuçtur.
- **Her araç zarfla döner** (`cevapla(zarfla(kaynak, veri, url))`), hata `hata(error)` ile. Değer uydurulmaz.
- **Açıklamalar iki dilli:** Türkçe önce, kısa bir İngilizce açıklama ardından — İngilizce düşünen modeller aracı doğru seçsin.
- `annotations.readOnlyHint: true` ve ağ kullanıyorsa `openWorldHint: true`.

## 4. Test edin

- Birim testi: gerçek yanıttan alınmış fixture ile ayrıştırıcı; sunucu üzerinden en az bir çağrı (`tests/unit/server.test.ts` örneğine bakın — `fetch` stub'lanır).
- Sözleşme testi: `tests/contract/` altına, gerçek uç noktaya karşı, şeklini pinleyen bir test. `npm run test:live` ile koşar; haftalık CI de koşar.
- `npm run verify` yeşil olmalı (kapsama eşiği %80).

## 5. PR açın

Başlık `feat(<id>): …`. Gövdede: kurum, uç nokta, kullanım şartının bağlantısı, örnek soru ve örnek yanıt. SOURCES.md ve README'deki araç tablosu güncellenmiş olsun.
