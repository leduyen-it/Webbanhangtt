(function () {
  if (document.getElementById("hsChatPanel")) return;

  var history = [];
  var lastProductIds = [];
  var storageKey = "helmetStoreChatHistory";
  document.body.classList.add("has-helmet-chat");

  var style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/css/chat-widget.css?v=3";
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.className = "hs-chat-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Mở chat Helmet Store AI");
  launcher.setAttribute("aria-controls", "hsChatPanel");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("data-tooltip", "Trợ lý AI");
  launcher.title = "Trợ lý AI";
  launcher.innerHTML = "<span class=\"hs-chat-launcher-inner\" aria-hidden=\"true\"><img class=\"hs-chat-launcher-robot\" src=\"/images/Chatbot.jpg\" alt=\"Chatbot AI\" /></span><span class=\"hs-chat-launcher-badge\">AI</span>";

  var panel = document.createElement("section");
  panel.className = "hs-chat-panel";
  panel.id = "hsChatPanel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Helmet Store AI");
  panel.hidden = true;
  panel.innerHTML =
    '<header class="hs-chat-header">' +
      '<div class="hs-chat-heading">' +
        '<div class="hs-chat-avatar">' +
          '<img src="/images/Chatbot.jpg" alt="Helmet Store AI" class="hs-chat-avatar-image" />' +
        '</div>' +
        '<div class="hs-chat-meta">' +
          '<p class="hs-chat-title">Helmet Store AI</p>' +
          '<span class="hs-chat-subtitle"><span class="hs-chat-status-dot"></span>Đang trực tuyến</span>' +
        '</div>' +
      '</div>' +
      '<div class="hs-chat-header-actions">' +
        '<span class="hs-chat-header-label">Trợ lý AI</span>' +
        '<button type="button" class="hs-chat-close" aria-label="Đóng chat">&times;</button>' +
      '</div>' +
    '</header>' +
    '<div class="hs-chat-messages" aria-live="polite" aria-relevant="additions text"></div>' +
    '<form class="hs-chat-compose">' +
      '<textarea class="hs-chat-input" rows="1" maxlength="1500" aria-label="Nội dung tin nhắn" placeholder="Nhập câu hỏi của bạn..."></textarea>' +
      '<button class="hs-chat-send" type="submit" aria-label="Gửi tin nhắn"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.3 12.6 20.2 4a1.15 1.15 0 0 1 1.6 1.4l-4.4 14.8a1.15 1.15 0 0 1-2.1.2l-2.6-6.1-6.1-2.6a1.15 1.15 0 0 1 .2-2.1Zm2.8 0 5.9 2.5 2.4-2.4-8.3-2.1Z" fill="currentColor"/></svg></button>' +
    '</form>' +
    '<div class="hs-chat-note">Không gửi mật khẩu, OTP hoặc thông tin thanh toán.</div>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var messages = panel.querySelector(".hs-chat-messages");
  var form = panel.querySelector(".hs-chat-compose");
  var input = panel.querySelector(".hs-chat-input");
  var sendButton = panel.querySelector(".hs-chat-send");
  var closeButton = panel.querySelector(".hs-chat-close");
  var quickQuestions;

  function scrollToLatest() {
    messages.scrollTop = messages.scrollHeight;
  }

  function sanitizeDisplayedText(text) {
    return String(text || "")
      .replace(/https?:\/\/[^\s)\]]+/gi, " ")
      .replace(/\[[^\]]+\]\((?:\/|https?:\/\/)[^)]+\)/gi, " ")
      .replace(/(?:^|[\s(])\/(?:san-pham|product|lien-he|gio-hang|dang-nhap|tai-khoan|checkout|cart|account)(?:[/?#][^\s)\]]+)?/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function appendSafeHtml(container, html) {
    var parser = new DOMParser();
    var parsed = parser.parseFromString(String(html || ""), "text/html");
    var allowedTags = {
      A: true, BLOCKQUOTE: true, BR: true, CODE: true, EM: true, H1: true,
      H2: true, H3: true, H4: true, HR: true, LI: true, OL: true, P: true,
      PRE: true, STRONG: true, UL: true,
    };

    function copyNodes(source, target) {
      Array.prototype.forEach.call(source.childNodes, function (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          var sanitized = sanitizeDisplayedText(node.textContent);
          if (sanitized) target.appendChild(document.createTextNode(sanitized));
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (!allowedTags[node.tagName]) {
          copyNodes(node, target);
          return;
        }
        var element = document.createElement(node.tagName.toLowerCase());
        if (node.tagName === "A") {
          var href = node.getAttribute("href") || "";
          var isInternalRoute = /^(?:\/|https?:\/\/[^/]+\/)(?:san-pham|product|lien-he|gio-hang|dang-nhap|tai-khoan|checkout|cart|account)(?:[/?#]|$)/i.test(href);
          if (isInternalRoute) {
            var routeText = sanitizeDisplayedText(node.textContent || "");
            if (routeText) target.appendChild(document.createTextNode(routeText));
            return;
          }
          try {
            var link = new URL(href, window.location.origin);
            if (
              link.origin === window.location.origin ||
              link.protocol === "https:" ||
              link.protocol === "http:" ||
              link.protocol === "mailto:"
            ) {
              element.setAttribute("href", link.href);
              if (link.origin !== window.location.origin) {
                element.setAttribute("rel", "noopener noreferrer");
              }
            }
          } catch (error) {
            // Invalid links are rendered as plain text.
          }
        }
        copyNodes(node, element);
        if (element.childNodes.length) target.appendChild(element);
      });
    }

    copyNodes(parsed.body, container);
  }

  function appendProductCards(container, products) {
    if (!Array.isArray(products) || !products.length) return;
    var list = document.createElement("div");
    list.className = "hs-chat-products";
    products.forEach(function (product) {
      if (!product || !Number.isSafeInteger(Number(product.id))) return;
      var card = document.createElement("article");
      card.className = "hs-chat-product";
      var image = document.createElement("img");
      image.className = "hs-chat-product-image";
      image.alt = String(product.name || "Sản phẩm Helmet Store");
      image.loading = "lazy";
      if (typeof product.image === "string" && /^\/img\/[a-zA-Z0-9._/-]+$/.test(product.image) && !product.image.includes("..")) {
        image.src = product.image;
      } else {
        image.hidden = true;
      }
      card.appendChild(image);

      var details = document.createElement("div");
      details.className = "hs-chat-product-details";
      var name = document.createElement("h4");
      name.className = "hs-chat-product-name";
      name.textContent = String(product.name || "Sản phẩm");
      details.appendChild(name);
      if (product.category) {
        var category = document.createElement("p");
        category.className = "hs-chat-product-category";
        category.textContent = String(product.category);
        details.appendChild(category);
      }
      var price = document.createElement("strong");
      price.className = "hs-chat-product-price";
      price.textContent = Number.isFinite(Number(product.price))
        ? new Intl.NumberFormat("vi-VN").format(Number(product.price)) + " ₫"
        : "Liên hệ cửa hàng";
      details.appendChild(price);

      var stock = document.createElement("span");
      stock.className = "hs-chat-product-stock";
      stock.textContent =
        product.stock === null
          ? "Chưa có thông tin tồn kho"
          : Number(product.stock) > 0
            ? "Còn hàng"
            : "Hết hàng";
      details.appendChild(stock);
      if (product.sizes && product.sizes.length) {
        var sizes = document.createElement("span");
        sizes.className = "hs-chat-product-sizes";
        sizes.textContent = "Size: " + product.sizes.join(", ");
        details.appendChild(sizes);
      }
      if (product.description) {
        var description = document.createElement("p");
        description.className = "hs-chat-product-description";
        description.textContent = String(product.description);
        details.appendChild(description);
      }

      var actions = document.createElement("div");
      actions.className = "hs-chat-product-actions";
      var detailUrl = "";
      try {
        var detail = new URL(String(product.detailUrl || ""), window.location.origin);
        if (detail.origin === window.location.origin && detail.pathname.indexOf("/san-pham/") === 0) {
          detailUrl = detail.pathname;
        }
      } catch (error) {
        detailUrl = "";
      }
      if (detailUrl) {
        var detailLink = document.createElement("a");
        detailLink.className = "hs-chat-product-link";
        detailLink.href = detailUrl;
        detailLink.textContent = "Xem chi tiết";
        actions.appendChild(detailLink);
      }

      if (Number(product.stock) > 0 && Array.isArray(product.sizes) && product.sizes.length) {
        var sizeSelect = document.createElement("select");
        sizeSelect.className = "hs-chat-product-size";
        sizeSelect.setAttribute("aria-label", "Chọn kích cỡ");
        product.sizes.forEach(function (size) {
          if (!/^[SML]$/.test(size)) return;
          var option = document.createElement("option");
          option.value = size;
          option.textContent = "Size " + size;
          sizeSelect.appendChild(option);
        });
        if (sizeSelect.options.length) {
          var addButton = document.createElement("button");
          addButton.className = "hs-chat-product-add";
          addButton.type = "button";
          addButton.textContent = "Thêm vào giỏ hàng";
          addButton.addEventListener("click", async function () {
            addButton.disabled = true;
            try {
              var response = await fetch("/cart/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  idProduct: Number(product.id),
                  quantity: 1,
                  size: sizeSelect.value,
                }),
              });
              var result = await response.json();
              if (response.status === 401) {
                window.location.href = "/users/dang-nhap";
                return;
              }
              if (!response.ok || !result.success) {
                addButton.textContent = result.message || "Không thể thêm";
                return;
              }
              addButton.textContent = "Đã thêm vào giỏ";
            } catch (error) {
              addButton.textContent = "Thử lại sau";
            } finally {
              addButton.disabled = false;
            }
          });
          actions.appendChild(sizeSelect);
          actions.appendChild(addButton);
        }
      }
      details.appendChild(actions);
      card.appendChild(details);
      list.appendChild(card);
    });
    if (list.childElementCount) container.appendChild(list);
  }

  function addMessage(role, content, isError, replyHtml, products) {
    var row = document.createElement("div");
    row.className = "hs-chat-row hs-chat-row--" + role;

    if (role === "assistant") {
      var avatar = document.createElement("div");
      avatar.className = "hs-chat-message-avatar";
      avatar.innerHTML =
        '<img src="/images/Chatbot.jpg" alt="Helmet Store AI" class="hs-chat-message-avatar-image" />';
      row.appendChild(avatar);
    }

    var bubble = document.createElement("div");
    bubble.className =
      "hs-chat-message hs-chat-message--" +
      role +
      (isError ? " hs-chat-message--error" : "");
    if (role === "assistant" && replyHtml) {
      appendSafeHtml(bubble, replyHtml);
    } else {
      bubble.textContent = content;
    }

    if (role === "assistant") {
      var response = document.createElement("div");
      response.className = "hs-chat-response";
      response.appendChild(bubble);
      appendProductCards(response, products);
      row.appendChild(response);
    } else {
      row.appendChild(bubble);
    }

    messages.appendChild(row);
    scrollToLatest();
    return bubble;
  }

  function showTyping() {
    var row = document.createElement("div");
    row.className = "hs-chat-row hs-chat-row--assistant";

    var avatar = document.createElement("div");
    avatar.className = "hs-chat-message-avatar";
    avatar.innerHTML =
      '<img src="/images/Chatbot.jpg" alt="Helmet Store AI" class="hs-chat-message-avatar-image" />';
    row.appendChild(avatar);

    var bubble = document.createElement("div");
    bubble.className = "hs-chat-message hs-chat-message--assistant hs-chat-message--typing";
    bubble.setAttribute("aria-label", "AI đang trả lời");
    bubble.innerHTML =
      '<span class="hs-chat-typing"><span></span><span></span><span></span></span>';
    row.appendChild(bubble);
    messages.appendChild(row);
    scrollToLatest();
    return row;
  }

  function saveHistory() {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(history.slice(-8)));
    } catch (error) {
      console.warn("Chat history could not be saved.");
    }
  }

  function hideQuickQuestions() {
    if (quickQuestions) quickQuestions.remove();
  }

  var greeting = addMessage(
    "assistant",
    "Xin chào! Tôi là trợ lý AI của Helmet Store. Tôi có thể giúp bạn tìm kiếm và lựa chọn chiếc mũ bảo hiểm phù hợp. Bạn cần hỗ trợ gì hôm nay?"
  );
  quickQuestions = document.createElement("div");
  quickQuestions.className = "hs-chat-suggestions";
  quickQuestions.setAttribute("aria-label", "Câu hỏi gợi ý");
  [
    ["fa-hard-hat", "Tư vấn chọn mũ bảo hiểm"],
    ["fa-tags", "Tìm mũ theo mức giá"],
    ["fa-box-open", "Sản phẩm bán chạy"],
    ["fa-truck", "Chính sách giao hàng và đổi trả"],
    ["fa-boxes", "Kiểm tra sản phẩm còn hàng"],
    ["fa-search", "Tra cứu đơn hàng"],
  ].forEach(function (item) {
    var question = document.createElement("button");
    question.className = "hs-chat-suggestion";
    question.type = "button";
    question.innerHTML =
      '<i class="fas ' + item[0] + '" aria-hidden="true"></i><span></span>';
    question.querySelector("span").textContent = item[1];
    question.addEventListener("click", function () {
      hideQuickQuestions();
      sendMessage(item[1]);
    });
    quickQuestions.appendChild(question);
  });
  messages.appendChild(quickQuestions);

  try {
    var savedHistory = JSON.parse(window.sessionStorage.getItem(storageKey) || "[]");
    if (Array.isArray(savedHistory)) {
      history = savedHistory
        .filter(function (message) {
          return (
            message &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string"
          );
        })
        .slice(-8);
      history.forEach(function (message) {
        addMessage(message.role, message.content, false, message.replyHtml, message.products);
      });
      var lastAssistant = history.slice().reverse().find(function (message) {
        return message.role === "assistant" && Array.isArray(message.products);
      });
      if (lastAssistant) {
        lastProductIds = lastAssistant.products
          .map(function (product) { return Number(product.id); })
          .filter(function (id) { return Number.isSafeInteger(id) && id > 0; })
          .slice(0, 6);
      }
      if (history.length) {
        greeting.remove();
        hideQuickQuestions();
      }
    }
  } catch (error) {
    console.warn("Chat history could not be restored.");
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.classList.toggle("is-open", open);
    panel.classList.toggle("is-open", open);
    launcher.setAttribute(
      "aria-label",
      open ? "Đóng chat Helmet Store AI" : "Mở chat Helmet Store AI"
    );
    if (open) input.focus();
  }

  async function sendMessage(suggestedText) {
    var text = (typeof suggestedText === "string" ? suggestedText : input.value).trim();
    if (!text || sendButton.disabled) return;

    input.value = "";
    input.style.height = "auto";
    history.push({ role: "user", content: text });
    addMessage("user", text);
    sendButton.disabled = true;
    var typing = showTyping();

    try {
      var response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-8),
          contextProductIds: lastProductIds,
        }),
      });
      var result = null;
      try {
        result = await response.json();
      } catch (error) {
        result = null;
      }
      typing.remove();
      if (!response.ok) {
        addMessage(
          "assistant",
          result.error || "Hiện chưa thể trả lời. Vui lòng thử lại sau.",
          true
        );
        history.pop();
        return;
      }
      var answer =
        result && typeof result.answer === "string" ? result.answer.trim() : "";
      answer = answer.replace(/https?:\/\/[^\s)\]]+/gi, " ").replace(/\[[^\]]+\]\((?:\/|https?:\/\/)[^)]+\)/gi, " ").replace(/(?:^|[\s(])\/(?:san-pham|product|lien-he|gio-hang|dang-nhap|tai-khoan|checkout|cart|account)(?:[/?#][^\s)\]]+)?/gi, " ").replace(/\s{2,}/g, " ").trim();
      if (!answer) {
        addMessage(
          "assistant",
          "Trợ lý vừa gửi phản hồi chưa hợp lệ. Vui lòng thử lại sau.",
          true
        );
        history.pop();
        return;
      }
      var products = Array.isArray(result.products) ? result.products : [];
      var replyHtml =
        result && typeof result.replyHtml === "string" ? result.replyHtml : "";
      lastProductIds = products
        .map(function (product) { return Number(product && product.id); })
        .filter(function (id) { return Number.isSafeInteger(id) && id > 0; })
        .slice(0, 6);
      history.push({
        role: "assistant",
        content: answer,
        replyHtml: replyHtml,
        products: products,
      });
      history = history.slice(-8);
      saveHistory();
      addMessage("assistant", answer, false, replyHtml, products);
    } catch (error) {
      typing.remove();
      addMessage(
        "assistant",
        "Không kết nối được với trợ lý lúc này. Vui lòng thử lại hoặc liên hệ bộ phận hỗ trợ của cửa hàng.",
        true
      );
      history.pop();
      saveHistory();
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  }

  launcher.addEventListener("click", function () {
    setOpen(panel.hidden);
  });
  closeButton.addEventListener("click", function () {
    setOpen(false);
    launcher.focus();
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage();
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });
})();
