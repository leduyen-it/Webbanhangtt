# Helmet Store AI chat setup

The customer chat endpoint uses OpenAI Chat Completions from the server; the
browser never receives the provider API key. Set these variables in `.env` and
restart the application:

```dotenv
OPENAI_API_KEY=your-provider-api-key
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_MODEL` is optional and defaults to `gpt-4o-mini`. Keep the API key
private and never commit it to source control.

The chat appears on EJS pages under `views/site` and is intentionally omitted
from AdminLTE pages. The API is `POST /api/chat`; it retrieves a small set of
matching product facts from MySQL and does not send account, order, or payment
data to the AI provider. The database currently has no authoritative shipping,
returns, or warranty policy content, so the assistant directs customers to
`/lien-he` for those questions. Personal order questions are directed to the
signed-in account pages instead.

The endpoint limits messages to 1,500 characters and 12 requests per client IP
per 10 minutes. It returns a configuration message until `OPENAI_API_KEY` is
set; a simulated answer is never presented as an AI response.
