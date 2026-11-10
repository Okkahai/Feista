# Animasyon Short formatları: yapı ve optimizasyon araştırması

_Exported 2026-11-10 from the project's Claude Doc (rev 7, written 2026-11-05). Turkish. The 16 formats are implemented in `packages/core/src/formats.ts`._

## Özet

Kasım 2026 itibarıyla piyasada 16 ayrı animasyon Short formatı tespit ettim. Bunlar 5 aileye ayrılıyor: anlatıcılı hikâye, açıklayıcı (explainer), diyalog/karakter komedisi, seri mikro-dizi ve absürt/görsel. Yayıncı klipleri animasyon değil ama Clip Studio için 17. şablon olarak ekleniyor.

Her formatın bir "şeması" (beat yapısı) var ve hepsi aynı birkaç optimizasyon tekniğini farklı oranlarda kullanıyor: 0-3 sn hook, açık döngü (open loop), pattern interrupt, kelime kelime altyazı ve loop-back. "Wobbi" bir format değil; onun yerini genel **Hayvan hikâyeleri** formatı alıyor.

İki önemli uyarı var. Birincisi, kesin bir "kaç format var" sayısı veren bağımsız bir kaynak yok; listeler 18-25 "niş" arasında değişiyor ve animasyon olmayanları da karıştırıyor, 16 sayısı benim sentezim. İkincisi, kaynakların çoğu AI araç satıcılarının blogları; izlenme ve gelir rakamları doğrulanmadı. En sağlam kaynaklar YouTube'un 16 Temmuz 2026 politika açıklaması (TechCrunch), NYT/The Star haberi ve Wikipedia.

**Feista'yı doğrudan etkileyen bulgu:** YouTube 16 Temmuz 2026'da "inauthentic content" kapsamında üç türü para kazanmaya kapattı: şablonla üretilmiş tekrarlı içerik, izleyiciyi üzmeye yönelik içerik (örnek olarak "zor durumdaki hayvanın kurtarılması" verilmiş) ve hassas konularda konuşan AI kişilikleri ([TechCrunch](https://techcrunch.com/2026/07/20/youtube-clarifies-policies-around-ai-slop-and-upsetting-videos/)). Bu yüzden şablonlar her videoda gerçek çeşitlilik zorlamalı ve hayvan formatı "kurtarma" kalıbını sınırlamalı.

## Format kataloğu

Her satır Feista'da bir şablon olacak. Şema sütunu, script aşamasının ürettiği beat sırasıdır. Süreler kaynakların tipik aralığı, kural değil.

| # | Aile | Format | Süre (sn) | Şema (beat sırası) | Ses | Kaynak |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Anlatıcılı hikâye | Hayvan hikâyeleri | 20-35 | Hook (bir şey ters gidiyor) → istek ve bedel → 2-3 tırmanma → duygu çeviren dönüş → payoff → açılış karesine dönüş | 3. şahıs anlatıcı + SFX + müzik, sessiz komik an | Kendi üretim deneyimimiz (EP1-31) |
| 2 | Anlatıcılı hikâye | Çocuk ahlak hikâyesi | 30-60 | Karakter ve isteği → yanlış seçim → sonuç → fark ediş → ders cümlesi | Sıcak anlatıcı, parlak 3D/pastel 2D, okuma altyazısı | [atlabs](<https://www.atlabs.ai/blog/how-to-make-animated-moral-stories-for-kids-with-ai-(step-by-step-2026)>), [The Star/NYT](https://www.thestar.com.my/tech/tech-news/2026/03/11/how-ai-generated-videos-are-distorting-your-childs-youtube-feed) |
| 3 | Anlatıcılı hikâye | Animasyonlu korku hikâyesi | 45-90 | Tekinsiz detay → kural / uyarı → işaretlerin artması → ticking clock → açık kalan son veya "Part 2" | 1. şahıs anlatıcı, karanlık palet, drone ses | [fliki](https://fliki.ai/blog/best-faceless-youtube-niches), [dev.to](https://dev.to/cartney/how-to-write-cliffhangers-for-short-drama-that-hook-viewers-2jb8) |
| 4 | Anlatıcılı hikâye | Tarihi POV / zaman yolcusu | 30-60 | "POV: 1347'de uyandın" → duyusal detaylar → tehlike → hayatta kalma ipucu → şaşırtıcı gerçek | 2. şahıs anlatıcı, dönem ortam sesi | [openart](https://openart.ai/blog/ai-youtube-channel-ideas/), [miraflow](https://miraflow.ai/blog/ai-shorts-formats-that-go-viral-2026) |
| 5 | Anlatıcılı hikâye | Dini / mitolojik hikâye | 30-90 | Tanınmış an → dramatik yeniden anlatım → doğaüstü doruk → tek cümlelik anlam | Ciddi anlatıcı, epik müzik | [Premier Christianity](https://www.premierchristianity.com/opinion/millions-are-watching-these-bizarre-ai-bible-videos-on-tiktok-should-you-be-worried-or-encouraged/19850.article) |
| 6 | Açıklayıcı | "What happens if" 3D | 30-45 | Soru hook → kurulum → içeri zoom (aşırı yakın plan) → twist → payoff → izleyiciye soru | Sakin anlatıcı, parlak 3D, büyük altyazı | [taletok](https://taletok.io/blog/how-to-make-zack-d-films-style-videos-with-ai/), [snaplama](https://www.snaplama.com/blog/how-to-create-animation-videos-like-zack-d-films-in-2026) |
| 7 | Açıklayıcı | Stickman / whiteboard explainer | 30-60 | Problem → basit model → 3 adım → örnek → özet cümlesi | Anlatıcı, 2D çizgi, metin vurguları | [fliki](https://fliki.ai/blog/best-faceless-youtube-niches), [awisee](https://awisee.com/blog/successful-faceless-youtube-channels/) |
| 8 | Açıklayıcı | Reddit hikâyesi görselleştirme | 45-90 | Başlık kartı → olay → çatışma → "sonra..." → karşılık / güncelleme | TTS anlatıcı, ekranda metin | [fliki](https://fliki.ai/blog/best-faceless-youtube-niches) |
| 9 | Diyalog / karakter | "Cuh" 3D meme diyalog skeçi | 20-40 | Soğuk açılış (zaten tartışıyorlar) → laf sokma → tırmanma → punchline → tepki karesi | Karakter başına ayrı ses, sokak argosu, punch altyazı | [X @ismokerosin](https://x.com/ismokerosin/status/2083183456960368987), Gün'ün örneği "WITHOUT LABELS" |
| 10 | Diyalog / karakter | Konuşan nesne / yiyecek | 20-45 | Nesneler tanışır → kim daha önemli tartışması → bilgi veya gag → sürpriz kazanan | Karakter başına ses, Pixar benzeri 3D, dudak senkronu | [StreamingMeme](https://streamingmeme-main.vercel.app/articles/ai-talking-veggies-barbies-and-hulks-everywhere-is-this-the-biggest-social-media-trend-of-2026) |
| 11 | Diyalog / karakter | Meme animatic (ses üzerine) | 10-30 | Hazır ses / diyalog → karakterlerle sahneleme → görsel punchline | Kullanıcının hakkına sahip olduğu ses + dudak senkronu | [anijam](https://www.anijam.ai/blog/youtube-shorts-trends/) |
| 12 | Seri mikro-dizi | Meyve / hayvan mikro-draması | 60-240 | Önceki bölüm 1 sn → çatışma → itiraf / ihanet → cliffhanger → oy veya "Part N+1" | Karakter başına ses, pembe dizi müziği | [Wikipedia: Fruit Love Island](https://en.wikipedia.org/wiki/Fruit_Love_Island), [CGTN](https://news.cgtn.com/news/2026-03-20/AI-Influence-Pet-and-fruit-microdramas-take-the-internet-by-storm-1LEUvn7BBOE/p.html), [cybernews](https://cybernews.com/ai-news/china-pet-microdramas/), [Nation Thailand](https://www.nationthailand.com/life/art-culture/40068802) |
| 13 | Seri mikro-dizi | Sürekli karakterli aksiyon serisi | 30-60 | Tanıdık karakterler → yeni tehdit → savaş tırmanması → yeni güç / kayıp → cliffhanger | Diyalogsuz veya az, efekt ağırlıklı | [anijam](https://www.anijam.ai/blog/youtube-shorts-trends/) |
| 14 | Absürt / görsel | Italian brainrot (hibrit yaratık) | 10-30 | Yaratık tanıtım kartı → sahte İtalyanca isim ve şarkımsı tekerleme → absürt eylem → tekrar | TTS tekerleme | [opus.pro](https://www.opus.pro/blog/italian-brainrot-videos), [Euronews](https://euronews.com/next/2025/09/11/nonsensical-ai-generated-memes-are-everywhere-what-is-italian-brain-rot) |
| 15 | Absürt / görsel | Sessiz ASMR / satisfying | 10-30 | Doku yakın plan → tek kesintisiz işlem → doyurucu son → kusursuz loop | Anlatım yok, ses tasarımı | [miraflow](https://miraflow.ai/blog/ai-shorts-formats-that-go-viral-2026) |
| 16 | Absürt / görsel | Anime tarzı 2D anlatı | 30-60 | Duygusal açılış karesi → iç ses → çatışma → güç / itiraf anı → son poz | 1. şahıs iç ses, 2D anime | [outlierkit](https://outlierkit.com/resources/faceless-youtube-channels/) |
| 17 | Klip (animasyon değil) | Yayıncı klipleri | 15-60 | En güçlü anın 1 sn öncesi → olay → tepki → kesme | Orijinal yayın sesi, kelime kelime altyazı, 9:16 reframe | Sadece kullanıcının kendi veya izinli yayınları |

Notlar: 12. formatta bölümler 3 dakikayı aşabilir; YouTube Shorts üst sınırı 3 dakika ([Wikipedia: YouTube Shorts](https://en.wikipedia.org/wiki/YouTube_Shorts)). 2 ve 14 numaralı formatlar çocuklara yönelik sayılabilir; NYT'nin Şubat 2026 haberine göre YouTube bu tür beş kanalı Partner Program'dan çıkardı. 11. formatta trend sesler telif taşır; Feista yalnız kullanıcının yüklediği ve hakkına sahip olduğu sesi kabul etmeli.

## Optimizasyon teknikleri ve isimleri

Sektörde kullanılan 14 isimli teknik var ve formatlar bunların farklı kombinasyonlarından oluşuyor. Feista her şablonda hangi tekniklerin açık olduğunu tutacak ve script aşaması bunları kural olarak alacak.

| Teknik | Ne yapar | Formatlar (katalog no) | Kaynak |
| --- | --- | --- | --- |
| Hook (0-3 sn) / cold open | İlk karede bir şey zaten oluyor; izleyici 2 sn içinde bir soru taşıyor | Hepsi | [qten](https://app.qten.ai/content/blog/the-anatomy-of-a-viral-short-in-2026-a-data-backed-playbook-for-hooks-length-captions-faceless-content/), [grow-it](https://www.grow-it.se/en/resources/short-form-video-scripting-retention-hooks) |
| Open loop / curiosity gap | Cevabı sona saklanan soru açar | 1, 3, 4, 6, 8 | [grow-it](https://www.grow-it.se/en/resources/short-form-video-scripting-retention-hooks) |
| Pattern interrupt | 2-4 sn'de bir kadraj, açı veya ritim değişir | 1, 6, 9, 10, 13 | [qten](https://app.qten.ai/content/blog/the-anatomy-of-a-viral-short-in-2026-a-data-backed-playbook-for-hooks-length-captions-faceless-content/) |
| Re-hook (ikinci hook) | 15-20. saniyede yeni bir soru veya twist ile düşüşü keser | 3, 6, 8, 12 | [grow-it](https://www.grow-it.se/en/resources/short-form-video-scripting-retention-hooks) |
| "Therefore / but" kuralı | Beat'ler "ve sonra" ile değil, "bu yüzden / ama" ile bağlanır (Trey Parker ve Matt Stone'un yazım kuralı) | 1, 2, 9, 12 | Yaygın senaryo kuralı |
| Story Spine | "Bir zamanlar... her gün... bir gün... bu yüzden... sonunda" iskeleti (Kenn Adams, Pixar'da yaygınlaştı) | 1, 2, 5 | [genra](https://genra.ai/blog/how-to-create-ai-animated-stories-guide) |
| Escalation / rule of three | Her ara çekim bir öncekinden büyük; gag üçüncüde kırılır | 1, 9, 10, 13 | Yaygın komedi kuralı |
| Loop-back / seamless loop | Son kare ilk kareye bağlanır, video tekrar izlenir | 1, 14, 15 | [virvid](https://virvid.ai/blog/looping-structure-shorts-retention-2026) |
| Kinetic / word-by-word captions | Kelime kelime vurgulu altyazı; sessiz izlemede okunur | Hepsi (15 hariç) | [qten](https://app.qten.ai/content/blog/the-anatomy-of-a-viral-short-in-2026-a-data-backed-playbook-for-hooks-length-captions-faceless-content/) |
| Sound-off readability | Hikâye sessiz de anlaşılır | 1, 6, 15 | [virvid](https://virvid.ai/blog/ultimate-guide-on-viral-ai-shorts) |
| Comic silence / beat drop | Anahtar gag'da müzik \~1 sn susar | 1, 9, 10 | Kendi üretim deneyimimiz |
| Cliffhanger / ticking clock | Bölüm açık soruyla biter; tehdit yerine geri sayım vurgulanır | 3, 12, 13 | [dev.to](https://dev.to/cartney/how-to-write-cliffhangers-for-short-drama-that-hook-viewers-2jb8), [C21](https://www.c21media.net/news/fruit-love-island-takes-social-media-by-storm-as-ai-microdramas-set-to-surge/) |
| Recurring cast / character bible | Aynı karakterler her bölümde aynı görünür ve ses verir (referans sayfası) | 9, 10, 12, 13, 14 | [CGTN](https://news.cgtn.com/news/2026-03-20/AI-Influence-Pet-and-fruit-microdramas-take-the-internet-by-storm-1LEUvn7BBOE/p.html) |
| Variation guard | Her video önceki 10 videodan farklı olay şekli ve son türü kullanır | Hepsi | [TechCrunch](https://techcrunch.com/2026/07/20/youtube-clarifies-policies-around-ai-slop-and-upsetting-videos/) (şablon içerik kuralı) |

Satıcı bloglarındaki "%X daha fazla izlenme" rakamlarını tabloya almadım; hiçbiri doğrulanabilir veri kaynağı göstermiyor.

## Feista için şablon tasarımı

Bütün 17 format tek bir şablon yapısına sığıyor; formatları ayıran 8 alan var. Kullanıcı hazır şablonu seçer, isterse alanları değiştirip kendi şablonunu kaydeder. Kodda sabit "Wobbi kuralları" kalkacak; hayvan hikâyeleri bu yapıdaki 1 numaralı şablon olacak.

| Alan | Değerler | Neyi değiştirir |
| --- | --- | --- |
| Ses modu | anlatıcı (1./2./3. şahıs), diyalog, iç ses, sessiz, orijinal ses | Script şeması (anlatıcı satırları mı, karakter replikleri mi) ve TTS aşaması |
| Kadro | 0-5 karakter, karakter başına ses | Karakter sayfası ve diyalogda karakter başına ElevenLabs sesi |
| Süre ve çekim sayısı | örn. 20-35 sn, 4-8 çekim | Script doğrulaması (şu an sabit 15-60 sn) |
| Beat şeması | Katalogdaki sıralı beat listesi | Concept ve script istemi |
| Teknikler | Optimizasyon tablosundaki 14 teknikten seçilenler | Script istemine eklenen kurallar |
| Görsel stil | 3D Pixar benzeri, 2D pastel, anime, stickman, karanlık vb. | Keyframe ve karakter sayfası istemi |
| Seri modu | tek video veya bölüm (önceki bölüm özeti, cliffhanger zorunlu) | Concept geçmişi ve sonraki bölümün girdisi |
| Güvenlik | çocuk kitlesi, "zor durumdaki hayvan" sınırı, telifli ses yasağı | YouTube made-for-kids ayarı ve concept reddi |

Uygulama sırası:

1. Şablon yapısı ve 16 animasyon şablonu `packages/core` içinde; `llm.ts` sabit kurallar yerine projenin şablonunu okur.
2. Diyalog modu: script şemasına konuşan karakter alanı, narration aşamasına karakter başına ses.
3. Seri modu ve varyasyon koruması (son 10 konsept zaten okunuyor, şablona göre genişler).
4. Kullanıcı şablonu: mobil uygulamada alanları düzenleyip kaydetme.
5. Clip Studio (17): VOD alımı, transkript, LLM ile an seçimi, 9:16 reframe, altyazı.

Açık soru: 12 numaralı mikro-dizi formatında 3 dakikayı aşan bölümler Shorts olmaz; bunları normal video olarak mı yükleyelim, yoksa şablonu 3 dakikayla mı sınırlayalım? Varsayılan olarak 3 dakika sınırı koyuyorum.

## Kaynaklar ve güvenilirlik

Güvenilir (haber, ansiklopedi, platform politikası):

- [TechCrunch, 20 Temmuz 2026: YouTube inauthentic content açıklaması](https://techcrunch.com/2026/07/20/youtube-clarifies-policies-around-ai-slop-and-upsetting-videos/)
- [The Star / NYT, 11 Mart 2026: AI çocuk videoları](https://www.thestar.com.my/tech/tech-news/2026/03/11/how-ai-generated-videos-are-distorting-your-childs-youtube-feed)
- [Wikipedia: Fruit Love Island](https://en.wikipedia.org/wiki/Fruit_Love_Island), [Wikipedia: YouTube Shorts](https://en.wikipedia.org/wiki/YouTube_Shorts)
- [C21 Media: Fruit Love Island](https://www.c21media.net/news/fruit-love-island-takes-social-media-by-storm-as-ai-microdramas-set-to-surge/), [CGTN, 20 Mart 2026](https://news.cgtn.com/news/2026-03-20/AI-Influence-Pet-and-fruit-microdramas-take-the-internet-by-storm-1LEUvn7BBOE/p.html), [Cybernews](https://cybernews.com/ai-news/china-pet-microdramas/), [Nation Thailand](https://www.nationthailand.com/life/art-culture/40068802)
- [Euronews: Italian brainrot](https://euronews.com/next/2025/09/11/nonsensical-ai-generated-memes-are-everywhere-what-is-italian-brain-rot), [Premier Christianity: AI Bible videoları](https://www.premierchristianity.com/opinion/millions-are-watching-these-bizarre-ai-bible-videos-on-tiktok-should-you-be-worried-or-encouraged/19850.article)

Satıcı blogları (format tanımı için kullanıldı, rakamları doğrulanmadı): [taletok](https://taletok.io/blog/how-to-make-zack-d-films-style-videos-with-ai/), [snaplama](https://www.snaplama.com/blog/how-to-create-animation-videos-like-zack-d-films-in-2026), [opus.pro](https://www.opus.pro/blog/italian-brainrot-videos), [openart](https://openart.ai/blog/ai-youtube-channel-ideas/), [miraflow](https://miraflow.ai/blog/ai-shorts-formats-that-go-viral-2026), [fliki](https://fliki.ai/blog/best-faceless-youtube-niches), [outlierkit](https://outlierkit.com/resources/faceless-youtube-channels/), [awisee](https://awisee.com/blog/successful-faceless-youtube-channels/), [anijam](https://www.anijam.ai/blog/youtube-shorts-trends/), [qten](https://app.qten.ai/content/blog/the-anatomy-of-a-viral-short-in-2026-a-data-backed-playbook-for-hooks-length-captions-faceless-content/), [virvid](https://virvid.ai/blog/looping-structure-shorts-retention-2026), [grow-it](https://www.grow-it.se/en/resources/short-form-video-scripting-retention-hooks), [genra](https://genra.ai/blog/how-to-create-ai-animated-stories-guide), [atlabs](<https://www.atlabs.ai/blog/how-to-make-animated-moral-stories-for-kids-with-ai-(step-by-step-2026)>), [StreamingMeme](https://streamingmeme-main.vercel.app/articles/ai-talking-veggies-barbies-and-hulks-everywhere-is-this-the-biggest-social-media-trend-of-2026), [dev.to](https://dev.to/cartney/how-to-write-cliffhangers-for-short-drama-that-hook-viewers-2jb8).

Sosyal medya ve forumlar: [X @ismokerosin](https://x.com/ismokerosin/status/2083183456960368987) ("cuh" trendi). Reddit aramaları doğrudan başlık döndürmedi, yalnız SEO bloglarına çıktı; TikTok ve Reddit'te format sayımı yapan güvenilir bir başlık bulamadım.
