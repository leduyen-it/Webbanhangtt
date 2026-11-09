(function () {
  "use strict";

  var themeStorageKey = "helmet-store-theme";
  var root = document.documentElement;
  var savedTheme = window.localStorage.getItem(themeStorageKey);

  if (savedTheme === "dark" || savedTheme === "light") {
    root.setAttribute("data-theme", savedTheme);
  }

  function initializeHeaderTools() {
    var accountNavigation = document.querySelector(
      ".nav .navbar-nav.ml-auto"
    );
    var actionHost =
      accountNavigation ||
      document.querySelector(".information-header .container");
    if (!actionHost || actionHost.querySelector(".header-quick-actions")) {
      return;
    }

    var isSignedIn = Boolean(
      document.querySelector('a[href="/users/dang-xuat"]')
    );
    var actions = document.createElement("div");
    actions.className = "header-quick-actions";

    var notificationHost = document.createElement("div");
    notificationHost.className = "header-notification";

    var notificationButton = document.createElement("button");
    notificationButton.className = "header-tool-button notification-toggle";
    notificationButton.type = "button";
    notificationButton.setAttribute("aria-label", "Thông báo");
    notificationButton.setAttribute("aria-expanded", "false");
    notificationButton.setAttribute("aria-controls", "header-notification-panel");
    notificationButton.innerHTML =
      '<i class="fas fa-bell" aria-hidden="true"></i><span class="notification-badge" hidden></span>';

    var notificationPanel = document.createElement("section");
    notificationPanel.className = "notification-panel";
    notificationPanel.id = "header-notification-panel";
    notificationPanel.hidden = true;
    notificationPanel.setAttribute("aria-label", "Danh sách thông báo");

    var notificationPanelHeader = document.createElement("div");
    notificationPanelHeader.className = "notification-panel-header";
    var notificationTitle = document.createElement("strong");
    notificationTitle.textContent = "Thông báo";
    var markAllButton = document.createElement("button");
    markAllButton.className = "notification-mark-all";
    markAllButton.type = "button";
    markAllButton.textContent = "Đánh dấu đã đọc";
    markAllButton.hidden = !isSignedIn;
    notificationPanelHeader.appendChild(notificationTitle);
    notificationPanelHeader.appendChild(markAllButton);

    var notificationList = document.createElement("div");
    notificationList.className = "notification-list";
    notificationList.setAttribute("aria-live", "polite");
    notificationPanel.appendChild(notificationPanelHeader);
    notificationPanel.appendChild(notificationList);
    notificationHost.appendChild(notificationButton);
    notificationHost.appendChild(notificationPanel);

    var notificationBadge = notificationButton.querySelector(
      ".notification-badge"
    );

    function showNotificationMessage(message, className) {
      notificationList.textContent = "";
      var status = document.createElement("p");
      status.className = className || "notification-empty";
      status.textContent = message;
      notificationList.appendChild(status);
    }

    function updateNotificationBadge(count) {
      var unreadCount = Number(count) || 0;
      notificationBadge.hidden = unreadCount === 0;
      notificationBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      notificationButton.setAttribute(
        "aria-label",
        unreadCount > 0
          ? "Thông báo, " + unreadCount + " thông báo chưa đọc"
          : "Thông báo"
      );
    }

    function notificationUrl(notification) {
      var relatedId = Number(notification.related_id);
      if (
        (notification.type === "order_created" ||
          notification.type === "order_status") &&
        Number.isSafeInteger(relatedId) &&
        relatedId > 0
      ) {
        return "/orders/" + relatedId;
      }
      return "";
    }

    function markNotificationRead(notificationId) {
      return fetch("/api/notifications/" + encodeURIComponent(notificationId) + "/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then(function (response) {
        if (!response.ok) throw new Error("Không thể cập nhật thông báo");
        return response.json();
      });
    }

    function renderNotifications(notifications) {
      notificationList.textContent = "";
      if (!notifications.length) {
        showNotificationMessage("Bạn chưa có thông báo nào.");
        return;
      }

      notifications.forEach(function (notification) {
        var target = notificationUrl(notification);
        var item = document.createElement(target ? "a" : "button");
        item.className =
          "notification-item" + (notification.is_read ? "" : " is-unread");
        if (target) {
          item.href = target;
        } else {
          item.type = "button";
        }

        var itemTitle = document.createElement("strong");
        itemTitle.className = "notification-item-title";
        itemTitle.textContent = notification.title;
        var itemMessage = document.createElement("span");
        itemMessage.className = "notification-item-message";
        itemMessage.textContent = notification.message;
        var itemTime = document.createElement("time");
        itemTime.className = "notification-item-time";
        var createdAt = new Date(notification.created_at);
        itemTime.dateTime = createdAt.toISOString();
        itemTime.textContent = createdAt.toLocaleString("vi-VN");
        item.appendChild(itemTitle);
        item.appendChild(itemMessage);
        item.appendChild(itemTime);

        item.addEventListener("click", function (event) {
          if (target) event.preventDefault();
          if (notification.is_read) {
            if (target) window.location.assign(target);
            return;
          }

          markNotificationRead(notification.id)
            .then(function () {
              notification.is_read = 1;
              if (target) {
                window.location.assign(target);
              } else {
                refreshNotifications();
              }
            })
            .catch(function (error) {
              console.error("Mark notification read error:", error);
              showNotificationMessage(
                "Không thể cập nhật thông báo. Vui lòng thử lại.",
                "notification-error"
              );
            });
        });
        notificationList.appendChild(item);
      });
    }

    function refreshNotifications() {
      if (!isSignedIn) return Promise.resolve();
      return fetch("/api/notifications?limit=10")
        .then(function (response) {
          if (!response.ok) throw new Error("Không thể tải thông báo");
          return response.json();
        })
        .then(function (data) {
          updateNotificationBadge(data.unreadCount);
          renderNotifications(data.notifications);
        })
        .catch(function (error) {
          console.error("Load notifications error:", error);
          showNotificationMessage(
            "Không thể tải thông báo. Vui lòng thử lại.",
            "notification-error"
          );
        });
    }

    notificationButton.addEventListener("click", function () {
      var isOpen = !notificationPanel.hidden;
      notificationPanel.hidden = isOpen;
      notificationButton.setAttribute("aria-expanded", String(!isOpen));
      if (!isOpen && !isSignedIn) {
        notificationList.textContent = "";
        var loginPrompt = document.createElement("p");
        loginPrompt.className = "notification-empty";
        loginPrompt.appendChild(document.createTextNode("Đăng nhập để xem thông báo. "));
        var loginLink = document.createElement("a");
        loginLink.href = "/users/dang-nhap";
        loginLink.textContent = "Đăng nhập";
        loginPrompt.appendChild(loginLink);
        notificationList.appendChild(loginPrompt);
      } else if (!isOpen) {
        refreshNotifications();
      }
    });

    markAllButton.addEventListener("click", function () {
      fetch("/api/notifications/read-all", { method: "POST" })
        .then(function (response) {
          if (!response.ok) throw new Error("Không thể cập nhật thông báo");
          return refreshNotifications();
        })
        .catch(function (error) {
          console.error("Mark all notifications read error:", error);
          showNotificationMessage(
            "Không thể cập nhật thông báo. Vui lòng thử lại.",
            "notification-error"
          );
        });
    });

    document.addEventListener("click", function (event) {
      if (!notificationHost.contains(event.target)) {
        notificationPanel.hidden = true;
        notificationButton.setAttribute("aria-expanded", "false");
      }
    });

    var themeButton = document.createElement("button");
    themeButton.className = "header-tool-button";
    themeButton.type = "button";
    themeButton.setAttribute("aria-pressed", "false");

    function updateThemeButton() {
      var isDark = root.getAttribute("data-theme") === "dark";
      themeButton.setAttribute("aria-pressed", String(isDark));
      themeButton.setAttribute(
        "aria-label",
        isDark ? "Chuyển sang nền sáng" : "Chuyển sang nền tối"
      );
      themeButton.setAttribute(
        "title",
        isDark ? "Chuyển sang nền sáng" : "Chuyển sang nền tối"
      );
      themeButton.innerHTML = isDark
        ? '<i class="fas fa-sun" aria-hidden="true"></i>'
        : '<i class="fas fa-moon" aria-hidden="true"></i>';
    }

    themeButton.addEventListener("click", function () {
      var nextTheme =
        root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", nextTheme);
      window.localStorage.setItem(themeStorageKey, nextTheme);
      updateThemeButton();
    });

    updateThemeButton();
    actions.appendChild(notificationHost);
    actions.appendChild(themeButton);
    actionHost.appendChild(actions);
    refreshNotifications();
    if (isSignedIn) {
      window.setInterval(refreshNotifications, 60000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHeaderTools);
  } else {
    initializeHeaderTools();
  }
})();
