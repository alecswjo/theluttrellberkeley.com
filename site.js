(function () {
  var vid = document.querySelector("[data-hero-video]");
  if (vid && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { vid.removeAttribute("autoplay"); vid.pause(); }
  var header = document.querySelector("[data-header]");
  var hero = document.querySelector(".hero");
  function onScroll() {
    var limit = hero ? hero.offsetHeight - 80 : 40;
    header.classList.toggle("is-solid", window.scrollY > limit);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Tour tile: tap to play (muted, looping), tap again to pause.
  document.querySelectorAll("[data-tour]").forEach(function (box) {
    var v = box.querySelector("video");
    box.addEventListener("click", function () {
      if (v.paused) { v.play(); box.classList.add("is-playing"); }
      else { v.pause(); box.classList.remove("is-playing"); }
    });
  });

  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-in"); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach(function (el) { io.observe(el); });
})();
