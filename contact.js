/* Shared inquiry form handler. Every design includes this file and a <form data-inquiry>.
   The endpoint is a Google Apps Script web app owned by leasing@theluttrellberkeley.com:
   it appends a row to the "Luttrell Inquiries" Google Sheet and emails leasing@. */
window.LUTTRELL_CONTACT_ENDPOINT = window.LUTTRELL_CONTACT_ENDPOINT || "https://script.google.com/macros/s/AKfycbzakg-vo0JesAi84MC1nE6Q7o2CgLmsHCtE3_WitovM7UBsvPSsHjxAQoAF7iWpJkU5/exec";
(function () {
  function init(form) {
    var status = form.querySelector("[data-status]");
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new URLSearchParams(new FormData(form));
      data.set("page", location.href);
      data.set("design", document.documentElement.dataset.design || "");
      var endpoint = window.LUTTRELL_CONTACT_ENDPOINT;
      button.disabled = true;
      form.dataset.state = "sending";
      if (status) status.textContent = "Sending…";
      try {
        if (!endpoint) throw new Error("no endpoint");
        var res = await fetch(endpoint, { method: "POST", body: data });
        var json = await res.json();
        if (!json.ok) throw new Error(json.error || "failed");
        form.dataset.state = "sent";
        if (status) status.textContent = "Thank you — we'll reply by email.";
        form.reset();
      } catch (err) {
        form.dataset.state = "error";
        if (status) {
          status.innerHTML = 'Something went wrong. Email us at <a href="mailto:leasing@theluttrellberkeley.com">leasing@theluttrellberkeley.com</a>.';
        }
      } finally {
        button.disabled = false;
      }
    });
  }
  document.querySelectorAll("form[data-inquiry]").forEach(init);
})();
