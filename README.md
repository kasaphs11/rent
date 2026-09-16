# Meltemi Rentals

Mobile-first landing page για αιτήματα ενοικίασης αυτοκινήτων στην Κω.

## Εκκίνηση

Απαιτεί Node.js 20+ και δεν έχει εξωτερικές εξαρτήσεις.

```bash
npm start
```

Η σελίδα ανοίγει στο `http://127.0.0.1:3000`.

## Πραγματική αποστολή φόρμας

Το `POST /api/booking` ελέγχει τα πεδία server-side και αποθηκεύει κάθε έγκυρο αίτημα στο `data/booking-requests.jsonl`. Το αρχείο δημιουργείται αυτόματα και εξαιρείται από το Git επειδή περιέχει προσωπικά δεδομένα.

Για να προωθείται ταυτόχρονα κάθε αίτημα σε Make, Zapier, n8n ή άλλο CRM/email automation, όρισε το webhook πριν την εκκίνηση:

```powershell
$env:BOOKING_WEBHOOK_URL="https://example.com/your-webhook"
npm start
```

Η τοπική αποθήκευση γίνεται πριν από την προώθηση, ώστε ένα προσωρινό σφάλμα του webhook να μη χάσει το αίτημα. Σε production χρησιμοποίησε persistent storage και HTTPS.

## Πριν τη δημοσίευση

Αντικατάστησε στο `index.html` το προσωρινό τηλέφωνο `+30 22420 12345`, το email `hello@meltemirentals.gr`, τις ακριβείς τιμές/μοντέλα και το ωράριο με τα πραγματικά στοιχεία της επιχείρησης.

## Απόδοση

- Χωρίς framework, web fonts ή third-party scripts.
- Responsive hero 54 KB για κινητό και 221 KB για desktop.
- Μακροχρόνιο cache μόνο στα assets και no-cache σε HTML/CSS/JS.
