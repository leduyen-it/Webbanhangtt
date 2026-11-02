const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");
const test = require("node:test");

const originalLoad = Module._load;
let product = {
  idProduct: 7,
  showHide: 1,
  amountProduct: 2,
  S: 0,
  M: 1,
  L: 1,
};
let cartItems = [];
const addedItems = [];

Module._load = function (request, parent, isMain) {
  if (parent && /routes[\\/]cart\.js$/.test(parent.filename)) {
    if (request === "../models/model_cart") {
      return {
        addToCart: async (...args) => {
          addedItems.push(args);
          return { message: "Added" };
        },
        getCartItems: async () => cartItems,
        getCartCount: async () => 1,
      };
    }
    if (request === "../models/model_product") {
      return { detail: async () => product };
    }
    if (request === "../models/model_wishlist") return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const express = require("express");
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.session = { User: { id: 11 } };
  next();
});
app.use("/cart", require("../routes/cart"));

let server;

function postCart(payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path: "/cart/add",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({ status: response.statusCode, body: JSON.parse(responseBody) });
        });
      }
    );
    request.on("error", reject);
    request.end(body);
  });
}

test("cart add validates active stock and size before changing the cart", async (t) => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Module._load = originalLoad;
  });

  await t.test("adds a valid available size", async () => {
    const response = await postCart({ idProduct: 7, quantity: 1, size: "M" });
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(addedItems.at(-1), [11, 7, 1, "M"]);
  });

  await t.test("rejects unavailable size and hidden products", async () => {
    const callsBefore = addedItems.length;
    let response = await postCart({ idProduct: 7, quantity: 1, size: "S" });
    assert.equal(response.status, 409);
    assert.equal(addedItems.length, callsBefore);

    product = { ...product, showHide: 0 };
    response = await postCart({ idProduct: 7, quantity: 1, size: "M" });
    assert.equal(response.status, 404);
    assert.equal(addedItems.length, callsBefore);
    product = { ...product, showHide: 1 };
  });

  await t.test("rejects a quantity exceeding remaining stock", async () => {
    cartItems = [{ idProduct: 7, size: "M", quantity: 2 }];
    const callsBefore = addedItems.length;
    const response = await postCart({ idProduct: 7, quantity: 1, size: "M" });
    assert.equal(response.status, 409);
    assert.equal(addedItems.length, callsBefore);
    cartItems = [];
  });

  await t.test("rejects malformed or oversized quantities", async () => {
    for (const quantity of [0, -1, 100, "1item"]) {
      const response = await postCart({
        idProduct: 7,
        quantity,
        size: "M",
      });
      assert.equal(response.status, 400);
    }
  });
});
