(function () {
  if (document.getElementById("hsChatPanel")) return;

  var script = document.currentScript;
  var aiConfigured = script && script.dataset.aiConfigured === "true";
  var history = [];
  document.body.classList.add("has-helmet-chat");

  var style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/css/chat-widget.css";
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.className = "hs-chat-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Mở chat Helmet Store AI");
  launcher.setAttribute("aria-controls", "hsChatPanel");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<i class="fas fa-comments" aria-hidden="true"></i>';

  var panel = document.createElement("section");
  panel.className = "hs-chat-panel";
  panel.id = "hsChatPanel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Helmet Store AI");
  panel.hidden = true;
  panel.innerHTML =
    '<header class="hs-chat-header">' +
      '<div class="hs-chat-heading">' +
        '<div class="hs-chat-avatar"><i class="fas fa-robot" aria-hidden="true"></i></div>' +
        '<div><p class="hs-chat-title">Helmet Store AI</p><span class="hs-chat-subtitle">Tư vấn sản phẩm mũ bảo hiểm</span></div>' +
      '</div>' +
      '<button type="button" class="hs-chat-close" aria-label="Đóng chat">&times;</button>' +
    '</header>' +
    '<div class="hs-chat-messages" aria-live="polite" aria-relevant="additions text"></div>' +
    '<form class="hs-chat-compose">' +
      '<textarea class="hs-chat-input" rows="1" maxlength="1500" aria-label="Nội dung tin nhắn" placeholder="Nhập câu hỏi của bạn..."></textarea>' +
      '<button class="hs-chat-send" type="submit" aria-label="Gửi tin nhắn"><i class="fas fa-paper-plane" aria-hidden="true"></i></button>' +
    '</form>' +
    '<div class="hs-chat-note">Không gửi mật khẩu, OTP hoặc thông tin thanh toán.</div>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var messages = panel.querySelector(".hs-chat-messages");
  var form = panel.querySelector(".hs-chat-compose");
  var input = panel.querySelector(".hs-chat-input");
  var sendButton = panel.querySelector(".hs-chat-send");
  var closeButton = panel.querySelector(".hs-chat-close");

  function scrollToLatest() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(role, content, isError) {
    var bubble = document.createElement("div");
    bubble.className =
      "hs-chat-message hs-chat-message--" +
      role +
      (isError ? " hs-chat-message--error" : "");
    bubble.textContent = content;
    messages.appendChild(bubble);
    scrollToLatest();
    return bubble;
  }

  function showTyping() {
    var bubble = document.createElement("div");
    bubble.className = "hs-chat-message hs-chat-message--assistant";
    bubble.setAttribute("aria-label", "AI đang trả lời");
    bubble.innerHTML =
      '<span class="hs-chat-typing"><span></span><span></span><span></span></span>';
    messages.appendChild(bubble);
    scrollToLatest();
    return bubble;
  }

  addMessage(
    "assistant",
    aiConfigured
      ? "Xin chào! Tôi có thể giúp bạn tìm hiểu sản phẩm mũ bảo hiểm của Helmet Store. Bạn cần tư vấn gì?"
      : "Xin chào! Chat AI hiện chưa được cấu hình. Bạn vẫn có thể liên hệ cửa hàng tại /lien-he để được hỗ trợ."
  );

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute(
      "aria-label",
      open ? "Đóng chat Helmet Store AI" : "Mở chat Helmet Store AI"
    );
    if (open) input.focus();
  }

  async function sendMessage() {
    var text = input.value.trim();
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
        body: JSON.stringify({ messages: history.slice(-8) }),
      });
      var result = await response.json();
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
        typeof result.answer === "string"
          ? result.answer
          : "Tôi chưa nhận được câu trả lời. Vui lòng thử lại sau.";
      history.push({ role: "assistant", content: answer });
      history = history.slice(-8);
      addMessage("assistant", answer);
    } catch (error) {
      typing.remove();
      addMessage(
        "assistant",
        "Không kết nối được với trợ lý lúc này. Vui lòng thử lại hoặc liên hệ cửa hàng tại /lien-he.",
        true
      );
      history.pop();
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
