# Helmet Store AI chat setup

The chat uses the official `@google/genai` SDK on the server. Configure these
variables in `.env` and restart the application:

```dotenv
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

`GEMINI_MODEL` is optional and defaults to `gemini-3.1-flash-lite`. If a
configured primary model is unavailable, the endpoint makes one attempt with
the verified `gemini-3.1-flash-lite` fallback. Keep the API key private;
`.env` is ignored by Git and the key is never sent to the browser.
If Gemini is unavailable or no key is configured, product answers fall back
to concise text based only on the products returned from MySQL. The chat
continues to show those verified product cards; delivery/returns/warranty
questions direct customers to `/lien-he` rather than guessing. MySQL errors
remain visible as a friendly service-unavailable message and are not disguised
as successful product results.

The chat appears on public EJS pages under `views/site` and is omitted from
AdminLTE pages. Its endpoint is `POST /api/chat`. Product questions are matched
against visible (`showHide = 1`) records in the MySQL `product` table, joined
to `catalog` for the brand/category. Queries use parameterized values and only
read the existing name, price, stock, size, description, and category fields.
The response includes structured product cards with database IDs, images,
current prices, stock state, sizes, and detail links. The current schema has
no promotion/original-price or color columns, so the assistant does not invent
those details. Gemini never generates or executes SQL.
Messages outside the Helmet Store product/service scope receive a brief,
polite redirect without a Gemini call, product lookup, or product cards.
Product lookups are only run for explicit search/advice/buy/availability
requests; service-only questions do not query the product table.

Markdown replies are rendered on the server with `markdown-it` and sanitized
with `sanitize-html`. The browser only builds DOM nodes from the sanitized
markup and product data. Excess blank lines are normalized and chat paragraph,
list, and card spacing is kept compact. Adding to cart revalidates that the
product is active, the size is available, and stock is sufficient before saving.

The site does not provide authoritative shipping, returns, or warranty policy
details, so the assistant directs customers to `/lien-he` rather than guessing.
Personal order questions are directed to the signed-in account pages. The API
limits messages to 1,500 characters, conversation context to eight messages,
and traffic to 12 requests per client IP per 10 minutes.

Start the application with `npm start`. The chat greets customers with four
quick questions; conversation history is kept in the current browser tab for
the session. Run `npm run test:chat` for the chat API, product-card, and
cart-stock regression suites.
