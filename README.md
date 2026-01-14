# Weather Pro PWA (projekt na zaliczenie)

Nowoczesna aplikacja pogodowa w formie **PWA** (działa jak aplikacja na iPhone po dodaniu do ekranu początkowego).

## Funkcjonalności
- Aktualna pogoda (temperatura, odczuwalna, wiatr, wilgotność, opady)
- **Prognoza godzinowa (24h)**
- **Prognoza 7 dni**
- **Jakość powietrza (AQI, PM2.5, PM10, EU AQI) + rekomendacje**
- **Ulubione miejsca** (zapisywane lokalnie)
- **Geolokalizacja** „pogoda u mnie”
- **Mapa opadów**: warstwa radarowa RainViewer na mapie OSM
- **Tryb ciemny / jasny**
- Offline: strona offline + cache zasobów, cache zapytań

## Źródła danych
- Open‑Meteo: pogoda, prognozy, geokodowanie, jakość powietrza
- RainViewer: radar opadów (warstwa mapy)
- OpenStreetMap: mapy bazowe

## Uruchomienie lokalnie
Najprościej:
1. Otwórz folder w VS Code.
2. Uruchom serwer statyczny (np. „Live Server” albo `python -m http.server 8080`).
3. Wejdź na `http://localhost:8080`.

> Uwaga: Service Worker działa poprawnie na `http://localhost` i na HTTPS.

## Deployment na GitHub Pages
1. Wrzuć zawartość folderu do repozytorium.
2. W GitHub → Settings → Pages → wybierz branch (np. `main`) i folder root.
3. Otwórz link z GitHub Pages w Safari na iPhone.

## Instalacja na iPhone (ikona jak aplikacja)
1. Otwórz stronę w Safari.
2. Kliknij „Udostępnij” → „Dodaj do ekranu początkowego”.
3. Gotowe — uruchamiasz z ikonki w trybie „standalone”.

## Sterowanie ulubionymi
- Kliknij ⭐ aby dodać.
- Dłuższe przytrzymanie / prawy klik na chipie usuwa ulubione.

Powodzenia na zaliczeniu!
