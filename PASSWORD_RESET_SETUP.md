# Password reset email setup

Password reset sends a six-digit OTP through SMTP. Configure these variables in
the project's `.env` file, then restart the application:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-sending-account@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM=Helmet Store <your-sending-account@gmail.com>
PASSWORD_RESET_SECRET=generate-a-unique-secret
```

For Gmail, enable 2-Step Verification and create a Google App Password.
`SMTP_PASS` is that App Password, not the normal Gmail password. Port `465`
uses implicit TLS; port `587` can be used for STARTTLS.

Generate a unique reset secret locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use the generated value for `PASSWORD_RESET_SECRET`. Keep `.env` private and
never commit or share these values.

The OTP table must exist before using password reset. Apply
[`password_reset_migration.sql`](./password_reset_migration.sql) to the
project's MySQL database once; it creates the table without changing the
existing user table.

If any required SMTP or reset-secret variable is missing, the request page
reports the missing variable names and does not claim that an email was sent.
