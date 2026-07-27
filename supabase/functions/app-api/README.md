# Apex Bookings App API

Deploy this function after applying migrations:

```sh
supabase functions deploy app-api --project-ref pbbcttswmypvxwlfazhx
supabase secrets set GMAIL_SMTP_USER=apexbookings001@gmail.com GMAIL_SMTP_APP_PASSWORD=<gmail-app-password> APP_ORIGIN=<production-url> --project-ref pbbcttswmypvxwlfazhx
```

`SUPABASE_SERVICE_ROLE_KEY` is provided by the Supabase Edge Runtime. Never add it to `VITE_*` variables or browser code.
