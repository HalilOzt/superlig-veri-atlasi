# Süper Lig Veri Atlası

20 Kasım 2011–20 Kasım 2026 arasında Türkiye Süper Lig’inde yer alan 46 kulüp ve 4.953 tescilli karşılaşma için etkileşimli bir analiz sitesi.

[Yayımlanan siteyi aç](https://halilozt.github.io/superlig-veri-atlasi/)

## İçerik

- Takım karşılaştırmasında ortalama skor, gol modeli, şut bazlı xG, kadro değerleri, bahis oranları ve maç geçmişi
- Şehir, maç günü sıcaklığı ve rakibe göre takım performansı
- Başkan ve yöneticilerin kaynaklarıyla birlikte gösterilen şirket bağlantıları
- Dört BIST futbol hissesinin günlük fiyatları
- Sezon puanları ve dönem toplamları

Gol modeli geçmiş skorlardan hesaplanır. Şut bazlı xG arşivi 2026/27 sezonundaki 99 maçı kapsar. Şirket ağı 16 kulüpte belgelenen 55 bağlantıyı içerir. Yöntem ve kaynaklar sitede açıklanmıştır.

## Yerelde çalıştırma

Python 3 ile bu klasörde aşağıdaki komutu çalıştırıp [yerel siteyi açın](http://localhost:8000).

```sh
python -m http.server 8000 --directory dist
```

`dist/` dizini siteyi ve hazır veri anlık görüntüsünü içerir. Siteyi açmak için ek paket veya API anahtarı gerekmez.

## Veriyi yeniden oluşturma

`build_data.py`, özgün Excel çalışma kitabını ve isteğe bağlı Football-Data sezon CSV’lerini kullanır. CSV klasöründeki dosyalar `fd-2011.csv` gibi sezonun başlangıç yılıyla adlandırılır. Bu klasör verilmezse şut, kart ve xG gibi ek maç istatistikleri boş kalır. Bu adım için `openpyxl` gerekir.

```sh
python -m pip install openpyxl
python build_data.py Super_Lig_2011-2026.xlsx --football-data ./football-data
```
