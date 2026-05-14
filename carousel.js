// 1번 Hero의 weave 엽서 carousel
// /images/weave-cards/01.jpg, 02.jpg, ... 순차 시도. 없는 번호 만나면 stop.

(function () {
  const carousel = document.querySelector("[data-carousel]");
  if (!carousel) return;

  const stage = carousel.querySelector("[data-stage]");
  const dotsContainer = carousel.querySelector("[data-dots]");
  const prevBtn = carousel.querySelector("[data-prev]");
  const nextBtn = carousel.querySelector("[data-next]");

  const MAX_TRIES = 12;

  async function detectImages() {
    const images = [];
    for (let i = 1; i <= MAX_TRIES; i++) {
      const padded = String(i).padStart(2, "0");
      const exts = ["jpg", "jpeg", "png", "webp"];
      let found = null;
      for (const ext of exts) {
        const url = `/images/weave-cards/${padded}.${ext}`;
        const ok = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
        });
        if (ok) {
          found = url;
          break;
        }
      }
      if (!found) break;
      images.push(found);
    }
    return images;
  }

  function renderPlaceholder() {
    stage.innerHTML = `
      <div class="carousel__placeholder">
        weave 엽서 이미지를 추가하면<br />여기에 보입니다.<br />
        <span style="font-size: 11px; opacity: 0.6; margin-top: 12px; display: inline-block;">/images/weave-cards/01.jpg ~</span>
      </div>
    `;
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
    if (dotsContainer) dotsContainer.style.display = "none";
  }

  function renderCarousel(images) {
    let active = 0;

    // 이미지 element 생성
    stage.innerHTML = "";
    images.forEach((url, idx) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      if (idx === 0) img.classList.add("is-active");
      stage.appendChild(img);
    });

    // dots
    if (dotsContainer) {
      dotsContainer.innerHTML = "";
      images.forEach((_, idx) => {
        const dot = document.createElement("button");
        dot.className = "carousel__dot";
        if (idx === 0) dot.classList.add("is-active");
        dot.setAttribute("aria-label", `이미지 ${idx + 1}`);
        dot.addEventListener("click", () => goto(idx));
        dotsContainer.appendChild(dot);
      });
    }

    function goto(idx) {
      const imgs = stage.querySelectorAll("img");
      const dots = dotsContainer
        ? dotsContainer.querySelectorAll(".carousel__dot")
        : [];
      imgs[active].classList.remove("is-active");
      if (dots[active]) dots[active].classList.remove("is-active");
      active = ((idx % images.length) + images.length) % images.length;
      imgs[active].classList.add("is-active");
      if (dots[active]) dots[active].classList.add("is-active");
    }

    if (prevBtn) prevBtn.addEventListener("click", () => goto(active - 1));
    if (nextBtn) nextBtn.addEventListener("click", () => goto(active + 1));

    // 키보드 좌우
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") goto(active - 1);
      if (e.key === "ArrowRight") goto(active + 1);
    });

    // 이미지 1장이면 화살표·dots 숨김
    if (images.length === 1) {
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
      if (dotsContainer) dotsContainer.style.display = "none";
    }
  }

  detectImages().then((images) => {
    if (images.length === 0) {
      renderPlaceholder();
    } else {
      renderCarousel(images);
    }
  });
})();
