const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const originalLoad = Module._load;
const sqlCalls = [];
const generationCalls = [];
let visibleProducts = [
  {
    idProduct: 1,
    nameProduct: "AGV K1 Matte Black",
    imgProduct: "img/agv-k1.jpg",
    nameCat: "AGV",
    priceProduct: 7000000,
    amountProduct: 4,
    S: 0,
    M: 1,
    L: 0,
    desProduct: "Fullface màu đen nhám.",
  },
  {
    idProduct: 2,
    nameProduct: "Royal M138B",
    imgProduct: "img/royal-m138b.jpg",
    nameCat: "Royal",
    priceProduct: 800000,
    amountProduct: 5,
    S: 1,
    M: 1,
    L: 1,
    desProduct: "Mũ fullface.",
  },
];
let databaseError;
let emptyStrictSearch = false;
let generationBehavior = async () => ({ text: "Phản hồi kiểm thử." });

Module._load = function (request, parent, isMain) {
  if (
    parent &&
    /routes[\\/]chat\.js$/.test(parent.filename) &&
    request === "../models/database"
  ) {
    return {
      query: async (sql, params) => {
        sqlCalls.push({ sql, params });
        if (databaseError) throw databaseError;
        if (emptyStrictSearch && /\)\s+AND\s+\(/.test(sql)) return [];
        const selectedIds = sql.match(/p\.idProduct IN \(([\?, ]+)\)/);
        if (selectedIds) {
          const count = (selectedIds[1].match(/\?/g) || []).length;
          const ids = params.slice(0, count).map(Number);
          return visibleProducts.filter((product) => ids.includes(product.idProduct));
        }
        return visibleProducts;
      },
    };
  }
  if (
    parent &&
    /routes[\\/]chat\.js$/.test(parent.filename) &&
    request === "@google/genai"
  ) {
    return {
      GoogleGenAI: class {
        constructor(options) {
          assert.ok(options.apiKey);
          assert.equal(options.httpOptions.timeout, 25000);
        }

        models = {
          generateContent: async (parameters) => {
            generationCalls.push(parameters);
            return generationBehavior(parameters);
          },
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

process.env.GEMINI_API_KEY = "test-key-not-a-real-credential";
process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";

const express = require("express");
const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use("/api/chat", require("../routes/chat"));

let server;
let requestNumber = 0;

function postChat(messages, ip, contextProductIds) {
  requestNumber += 1;
  const body = JSON.stringify({ messages, contextProductIds });
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path: "/api/chat",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Forwarded-For": ip || `198.51.100.${requestNumber}`,
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          let json;
          try {
            json = JSON.parse(responseBody);
          } catch (error) {
            return reject(error);
          }
          resolve({ status: response.statusCode, body: json });
        });
      }
    );
    request.on("error", reject);
    request.end(body);
  });
}

test("chat endpoint, MySQL grounding, history, errors, and widget behavior", async (t) => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Module._load = originalLoad;
  });

  await t.test("budget parsing and contextual follow-up understand price ranges", async () => {
    const budgetResponse = await postChat([
      { role: "user", content: "Tôi có 1 triệu rưỡi, tư vấn cho tôi sản phẩm phù hợp giá tiền." },
    ]);
    assert.equal(budgetResponse.status, 200);
    assert.ok(budgetResponse.body.products.length > 0);
    assert.ok(budgetResponse.body.products.every((product) => product.price <= 1500000));

    const followUpResponse = await postChat([
      { role: "user", content: "Tôi có 1 triệu rưỡi, tư vấn cho tôi sản phẩm phù hợp giá tiền." },
      { role: "assistant", content: "Mình đã tìm các lựa chọn phù hợp." },
      { role: "user", content: "Tưởng có mũ giá 800 mà." },
    ]);
    assert.equal(followUpResponse.status, 200);
    assert.ok(followUpResponse.body.products.length > 0);
    assert.ok(followUpResponse.body.products.every((product) => product.price <= 800000 || product.price <= 1000000));
  });

  await t.test("quick questions are valid and product facts come from MySQL", async () => {
    const queriesBefore = sqlCalls.length;
    const questions = [
      "Tư vấn chọn mũ bảo hiểm",
      "Tìm mũ theo mức giá",
      "Kiểm tra sản phẩm còn hàng",
      "Chính sách giao hàng và đổi trả",
    ];
    for (const [index, question] of questions.entries()) {
      const response = await postChat([{ role: "user", content: question }]);
      assert.equal(response.status, 200);
      assert.equal(response.body.answer, "Phản hồi kiểm thử.");
      assert.equal(response.body.success, true);
      assert.ok(Array.isArray(response.body.products));
      if (index < 3) assert.ok(response.body.products.length > 0);
      if (index === 3) assert.equal(response.body.products.length, 0);
    }

    const frontend = fs.readFileSync(
      path.join(__dirname, "..", "public", "js", "chat-widget.js"),
      "utf8"
    );
    for (const question of questions) assert.ok(frontend.includes(question));
    assert.match(frontend, /sendMessage\(item\[1\]\)/);
    assert.match(frontend, /hideQuickQuestions\(\)/);

    assert.equal(sqlCalls.length, queriesBefore + 3);
    const call = sqlCalls.at(-1);
    assert.match(call.sql, /p\.showHide = 1/);
    assert.match(call.sql, /p\.imgProduct/);
    assert.match(call.sql, /p\.idProduct/);
    assert.match(call.sql, /p\.amountProduct/);
    assert.ok(call.params.every((parameter) => typeof parameter === "string"));
    assert.match(sqlCalls[queriesBefore + 2].sql, /p\.amountProduct > 0/);
  });

  await t.test("products are structured from MySQL and contain no invented sale fields", async () => {
    const response = await postChat([
      { role: "user", content: "Gợi ý mũ fullface" },
    ]);
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.products.map((product) => ({
        id: product.id,
        name: product.name,
        image: product.image,
        price: product.price,
        stock: product.stock,
        sizes: product.sizes,
        detailUrl: product.detailUrl,
      })),
      [
        {
          id: 1,
          name: "AGV K1 Matte Black",
          image: "/img/agv-k1.jpg",
          price: 7000000,
          stock: 4,
          sizes: ["M"],
          detailUrl: "/san-pham/agv-k1-matte-black",
        },
        {
          id: 2,
          name: "Royal M138B",
          image: "/img/royal-m138b.jpg",
          price: 800000,
          stock: 5,
          sizes: ["S", "M", "L"],
          detailUrl: "/san-pham/royal-m138b",
        },
      ]
    );
    assert.equal("originalPrice" in response.body.products[0], false);
    assert.equal("discount" in response.body.products[0], false);
  });

  await t.test("discount requests do not claim promotional data absent from the schema", async () => {
    const callsBefore = generationCalls.length;
    const queriesBefore = sqlCalls.length;
    const response = await postChat([
      { role: "user", content: "Sản phẩm nào đang giảm giá?" },
    ]);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.products, []);
    assert.match(response.body.answer, /chưa có dữ liệu xác nhận về chương trình khuyến mãi/i);
    assert.equal(generationCalls.length, callsBefore);
    assert.equal(sqlCalls.length, queriesBefore);
  });

  await t.test("unrelated and meaningless messages return brief guidance without Gemini or MySQL", async () => {
    const callsBefore = generationCalls.length;
    const queriesBefore = sqlCalls.length;
    for (const content of [
      "asdf qwer blabla",
      "Thủ đô của Pháp là gì?",
      "Viết giúp tôi một bài thơ về mùa thu",
    ]) {
      const response = await postChat([{ role: "user", content }]);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.products, []);
      assert.match(response.body.answer, /trợ lý Helmet Store/i);
      assert.ok(response.body.answer.length < 150);
    }
    assert.equal(generationCalls.length, callsBefore);
    assert.equal(sqlCalls.length, queriesBefore);
  });

  await t.test("greetings are polite and service-only questions do not look up products", async () => {
    const queriesBefore = sqlCalls.length;
    let response = await postChat([{ role: "user", content: "Xin chào" }]);
    assert.equal(response.status, 200);
    assert.match(response.body.answer, /Xin chào/i);
    assert.deepEqual(response.body.products, []);

    response = await postChat([
      { role: "user", content: "Phí giao hàng bao nhiêu?" },
    ]);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.products, []);
    assert.equal(sqlCalls.length, queriesBefore);
  });

  await t.test("no-match product queries return a grounded message without asking Gemini", async () => {
    const savedProducts = visibleProducts;
    visibleProducts = [];
    const callsBefore = generationCalls.length;
    const response = await postChat([
      { role: "user", content: "Tìm mũ bảo hiểm màu tím" },
    ]);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.products, []);
    assert.match(response.body.answer, /chưa tìm thấy sản phẩm đang bán phù hợp/i);
    assert.equal(generationCalls.length, callsBefore);
    visibleProducts = savedProducts;
  });

  await t.test("cheapest and continuing budget filters use actual price fields", async () => {
    let response = await postChat([{ role: "user", content: "Mẫu mũ nào rẻ nhất?" }]);
    assert.equal(response.status, 200);
    assert.match(sqlCalls.at(-1).sql, /ORDER BY p\.priceProduct ASC/);

    response = await postChat([
      { role: "user", content: "Tìm mũ dưới 500 nghìn" },
      { role: "assistant", content: "Đang tìm trong mức giá này." },
      { role: "user", content: "Có mũ fullface không?" },
    ]);
    assert.equal(response.status, 200);
    assert.match(sqlCalls.at(-1).sql, /p\.priceProduct <= \?/);
    assert.ok(sqlCalls.at(-1).params.includes(500000));
    assert.ok(sqlCalls.at(-1).params.includes("%fullface%"));
  });

  await t.test("product search retries broad matching after strict terms miss", async () => {
    emptyStrictSearch = true;
    const callsBefore = sqlCalls.length;
    const response = await postChat([
      { role: "user", content: "Gợi ý mũ fullface AGV" },
    ]);
    emptyStrictSearch = false;
    assert.equal(response.status, 200);
    assert.ok(response.body.products.length > 0);
    assert.match(sqlCalls[callsBefore].sql, /\)\s+AND\s+\(/);
    assert.match(sqlCalls[callsBefore + 1].sql, /\)\s+OR\s+\(/);
  });

  await t.test("a new recommendation does not inherit an unrelated old budget", async () => {
    const response = await postChat([
      { role: "user", content: "Tìm mũ dưới 500 nghìn" },
      { role: "assistant", content: "Chưa tìm thấy mẫu trong ngân sách." },
      { role: "user", content: "Tư vấn chọn mũ bảo hiểm" },
    ]);
    assert.equal(response.status, 200);
    assert.doesNotMatch(sqlCalls.at(-1).sql, /p\.priceProduct <= \?/);
    assert.ok(response.body.products.length > 0);
  });

  await t.test("follow-up selection uses only active products returned by the database", async () => {
    const response = await postChat(
      [
        { role: "user", content: "Gợi ý mũ fullface" },
        { role: "assistant", content: "Đây là các lựa chọn." },
        { role: "user", content: "Sản phẩm thứ hai thì sao?" },
      ],
      undefined,
      [1, 2]
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.products.map((product) => product.id), [2]);
    assert.match(sqlCalls.at(-1).sql, /p\.idProduct IN \(\?\)/);
    assert.deepEqual(sqlCalls.at(-1).params, [2, 2]);

    const stockResponse = await postChat(
      [
        { role: "user", content: "Gợi ý mũ fullface" },
        { role: "assistant", content: "Đây là các lựa chọn." },
        { role: "user", content: "Mũ này còn hàng không?" },
      ],
      undefined,
      [1, 2]
    );
    assert.deepEqual(stockResponse.body.products.map((product) => product.id), [1]);

    const compareResponse = await postChat(
      [
        { role: "user", content: "Gợi ý mũ fullface" },
        { role: "assistant", content: "Đây là các lựa chọn." },
        { role: "user", content: "So sánh hai mẫu này" },
      ],
      undefined,
      [1, 2, 3]
    );
    assert.deepEqual(compareResponse.body.products.map((product) => product.id), [1, 2]);

    const alternativesResponse = await postChat(
      [
        { role: "user", content: "Gợi ý mũ fullface" },
        { role: "assistant", content: "Đây là các lựa chọn." },
        { role: "user", content: "Có sản phẩm nào tương tự không?" },
      ],
      undefined,
      [1, 2]
    );
    assert.equal(alternativesResponse.status, 200);
    assert.match(sqlCalls.at(-1).sql, /p\.idProduct NOT IN \(\?,\?\)/);
  });

  await t.test("Markdown output is safe and keeps semantic formatting", async () => {
    generationBehavior = async () => ({
      text: "### Mẫu phù hợp\n\n***Fullface*** và *êm ái* [mở](javascript:alert(1))",
    });
    const response = await postChat([
      { role: "user", content: "Tư vấn mũ fullface" },
    ]);
    assert.equal(response.status, 200);
    assert.match(response.body.replyHtml, /<h3>Mẫu phù hợp/i);
    assert.match(response.body.replyHtml, /<em><strong>Fullface<\/strong><\/em>/);
    assert.match(response.body.replyHtml, /<em>êm ái<\/em>/);
    assert.doesNotMatch(response.body.replyHtml, /\*{1,3}|#{1,6}/);
    assert.doesNotMatch(response.body.replyHtml, /href=["']javascript:|<script|javascript:/i);
    assert.doesNotMatch(response.body.replyHtml, /<br\s*\/?>/i);
    generationBehavior = async () => ({ text: "Phản hồi kiểm thử." });
  });

  await t.test("name and category lookup uses escaped bound parameters", async () => {
    const response = await postChat([
      { role: "user", content: "Tìm thương hiệu AGV" },
    ]);
    assert.equal(response.status, 200);
    const call = sqlCalls.at(-1);
    assert.match(call.sql, /c\.nameCat LIKE \?/);
    assert.ok(call.params.includes("%agv%"));
    assert.doesNotMatch(call.sql, /AGV/);
  });

  await t.test("color searches filter by real text instead of imaginary color columns", async () => {
    const response = await postChat([
      { role: "user", content: "Cho tôi xem mũ màu đen" },
    ]);
    assert.equal(response.status, 200);
    const call = sqlCalls.at(-1);
    assert.ok(call.params.includes("%đen%"));
    assert.ok(!call.params.includes("%xem%"));
    assert.ok(!call.params.includes("%màu%"));
    assert.doesNotMatch(call.sql, /color|colour/i);
  });

  await t.test("budget and explicit price ranges become SQL filters", async () => {
    let response = await postChat([
      { role: "user", content: "Tìm mũ dưới 500 nghìn" },
    ]);
    assert.equal(response.status, 200);
    let call = sqlCalls.at(-1);
    assert.match(call.sql, /p\.priceProduct <= \?/);
    assert.ok(call.params.includes(500000));

    for (const question of [
      "Tìm mũ từ 500 nghìn đến 2 triệu",
      "Tìm mũ từ 1 đến 2 triệu",
    ]) {
      response = await postChat([{ role: "user", content: question }]);
      assert.equal(response.status, 200);
      call = sqlCalls.at(-1);
      assert.match(call.sql, /p\.priceProduct >= \?/);
      assert.match(call.sql, /p\.priceProduct <= \?/);
      assert.ok(call.params.includes(500000) || call.params.includes(1000000));
      assert.ok(call.params.includes(2000000));
    }
  });

  await t.test("requested sizes are filtered using existing database columns", async () => {
    const response = await postChat([
      { role: "user", content: "Mũ fullface còn size L không?" },
    ]);
    assert.equal(response.status, 200);
    assert.match(sqlCalls.at(-1).sql, /p\.L = 1/);
    assert.doesNotMatch(sqlCalls.at(-1).sql, /color|promotion|discount/i);
  });

  await t.test("product follow-up questions retain the selected product context", async () => {
    const followUps = [
      "Còn loại nào khác không?",
      "Mẫu đó giá bao nhiêu?",
      "Có màu đen không?",
      "Còn size L không?",
      "Sản phẩm thứ hai thì sao?",
      "Tôi muốn mua mẫu đó.",
    ];
    for (const followUp of followUps) {
      const response = await postChat([
        { role: "user", content: "Gợi ý mũ fullface thương hiệu AGV" },
        { role: "assistant", content: "Có một số lựa chọn." },
        { role: "user", content: followUp },
      ]);
      assert.equal(response.status, 200);
      assert.ok(sqlCalls.at(-1).params.some((value) => value.includes("agv")));
      if (/size L/i.test(followUp)) {
        assert.match(sqlCalls.at(-1).sql, /p\.L = 1/);
      }
    }
    const request = generationCalls.at(-1);
    assert.deepEqual(
      request.contents.map((message) => message.role),
      ["user", "model", "user"]
    );
    assert.match(request.config.systemInstruction, /khuyến mãi|khuyến mại/i);
    assert.match(request.config.systemInstruction, /Không tạo hoặc xác nhận đơn hàng/);
    assert.match(request.config.systemInstruction, /dữ liệu MySQL luôn là nguồn đúng/);
  });

  await t.test("sensitive personal questions do not reach Gemini or MySQL", async () => {
    const before = generationCalls.length;
    const queriesBefore = sqlCalls.length;
    for (const content of [
      "Tôi quên mật khẩu",
      "Cho tôi xem đơn hàng của tôi",
    ]) {
      const response = await postChat([{ role: "user", content }]);
      assert.equal(response.status, 200);
      assert.ok(response.body.answer);
    }
    assert.equal(generationCalls.length, before);
    assert.equal(sqlCalls.length, queriesBefore);
  });

  await t.test("empty, punctuation-only, and overlong messages are rejected", async () => {
    for (const content of ["", "   ", "!@#$%^&*()"]) {
      const response = await postChat([{ role: "user", content }]);
      assert.equal(response.status, 400);
    }
    const tooLong = await postChat([
      { role: "user", content: "x".repeat(1501) },
    ]);
    assert.equal(tooLong.status, 400);
  });

  await t.test("history sent to Gemini is bounded to eight messages", async () => {
    const messages = Array.from({ length: 11 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: index === 10 ? "Tư vấn mũ giúp tôi" : `message ${index}`,
    }));
    const response = await postChat(messages);
    assert.equal(response.status, 200);
    assert.equal(generationCalls.at(-1).contents.length, 8);
    assert.equal(generationCalls.at(-1).contents.at(-1).role, "user");
  });

  await t.test("missing key and Gemini failures use a safe grounded fallback", async () => {
    const key = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    let response = await postChat([
      { role: "user", content: "Có mũ fullface không?" },
    ]);
    assert.equal(response.status, 200);
    assert.ok(response.body.products.length > 0);
    assert.match(response.body.answer, /thẻ bên dưới/i);
    process.env.GEMINI_API_KEY = key;

    databaseError = Object.assign(new Error("private db details"), {
      code: "ER_ACCESS_DENIED_ERROR",
    });
    response = await postChat([{ role: "user", content: "Tìm mũ AGV" }]);
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(response.body), /private db details/i);
    databaseError = undefined;

    generationBehavior = async () => {
      throw Object.assign(new Error("provider quota"), { status: 429 });
    };
    const suggestions = [
      "Tư vấn chọn mũ bảo hiểm",
      "Tìm mũ theo mức giá",
      "Kiểm tra sản phẩm còn hàng",
      "Chính sách giao hàng và đổi trả",
    ];
    for (const [index, question] of suggestions.entries()) {
      response = await postChat([{ role: "user", content: question }]);
      assert.equal(response.status, 200);
      if (index < 3) assert.ok(response.body.products.length > 0);
      else {
        assert.deepEqual(response.body.products, []);
        assert.doesNotMatch(response.body.answer, /\/lien-he|\/san-pham|\/product/i);
        assert.match(response.body.answer, /bộ phận hỗ trợ|cửa hàng|chính sách/i);
      }
    }

    response = await postChat([{ role: "user", content: "Tư vấn mũ giúp tôi" }]);
    assert.equal(response.status, 200);
    assert.ok(response.body.products.length > 0);
    assert.doesNotMatch(response.body.answer, /\/lien-he|\/san-pham|\/product/i);
    assert.match(response.body.answer, /thẻ bên dưới|bộ phận hỗ trợ|cửa hàng/i);

    generationBehavior = async () => {
      throw Object.assign(new Error("temporary provider overload"), {
        status: 503,
      });
    };
    response = await postChat([
      { role: "user", content: "Tìm mũ dưới 500 nghìn" },
    ]);
    assert.equal(response.status, 200);
    assert.ok(response.body.products.length > 0);
    assert.match(response.body.answer, /thẻ bên dưới/i);

    generationBehavior = async () => ({});
    response = await postChat([{ role: "user", content: "Tư vấn mũ tiếp" }]);
    assert.equal(response.status, 200);
    assert.ok(response.body.products.length > 0);

    generationBehavior = async () => {
      throw Object.assign(new Error("unsupported model"), { status: 404 });
    };
    response = await postChat([
      { role: "user", content: "Kiểm tra model mũ" },
    ]);
    assert.equal(response.status, 200);
    assert.match(response.body.answer, /mũ bảo hiểm/i);

    generationBehavior = async () => {
      throw Object.assign(new Error("provider timeout"), {
        code: "ETIMEDOUT",
      });
    };
    response = await postChat([{ role: "user", content: "Thử timeout khi tư vấn mũ" }]);
    assert.equal(response.status, 200);
    assert.ok(response.body.products.length > 0);

    process.env.GEMINI_MODEL = "unavailable-primary";
    generationBehavior = async (parameters) => {
      if (parameters.model === "unavailable-primary") {
        throw Object.assign(new Error("model temporarily unavailable"), {
          status: 503,
        });
      }
      return { text: "Đã chuyển sang model dự phòng." };
    };
    response = await postChat([
      { role: "user", content: "Tư vấn mũ để thử model dự phòng" },
    ]);
    assert.equal(response.status, 200);
    assert.equal(response.body.answer, "Đã chuyển sang model dự phòng.");
    assert.equal(generationCalls.at(-2).model, "unavailable-primary");
    assert.equal(generationCalls.at(-1).model, "gemini-3.1-flash-lite");
    process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";
    generationBehavior = async () => ({ text: "Phản hồi kiểm thử." });
  });

  await t.test("rate limit blocks repeated requests", async () => {
    const ip = "198.51.100.250";
    let response;
    for (let index = 0; index < 13; index += 1) {
      response = await postChat([{ role: "user", content: "hello" }], ip);
    }
    assert.equal(response.status, 429);
  });

  await t.test("client keeps history, sends on Enter, and rejects malformed AI answers", async () => {
    const frontend = fs.readFileSync(
      path.join(__dirname, "..", "public", "js", "chat-widget.js"),
      "utf8"
    );
    assert.match(frontend, /sessionStorage/);
    assert.match(frontend, /event\.key === "Enter" && !event\.shiftKey/);
    assert.match(frontend, /sendButton\.disabled/);
    assert.match(frontend, /Trợ lý vừa gửi phản hồi chưa hợp lệ/);
    assert.match(frontend, /response\.json\(\)/);
    assert.match(frontend, /appendSafeHtml/);
    assert.match(frontend, /appendProductCards/);
    assert.match(frontend, /Thương hiệu: /);
    assert.match(frontend, /Tồn kho: /);
    assert.match(frontend, /Kích cỡ: /);
    assert.match(frontend, /renderFallbackMarkdown/);
    assert.match(frontend, /contextProductIds: lastProductIds/);
    assert.match(frontend, /fetch\("\/cart\/add"/);
    assert.match(frontend, /result\.replyHtml/);
    assert.match(frontend, /copyNodes/);
    assert.doesNotMatch(frontend, /GEMINI_API_KEY|OPENAI_API_KEY/);
  });
});
