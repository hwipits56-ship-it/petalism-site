// Carousel — Hero 및 각 work 섹션에서 재사용.
// data-carousel-folder="weave-cards" 같이 폴더 path 받음.
// /images/<folder>/01.jpg, 02.jpg, ... 자동 감지.

(function () {
  const MAX_TRIES = 12;
  const KB_FOLDER = "weave-cards"; // 키보드 ←→ 활성 carousel 폴더

  async function detectImages(folder) {
    // 01.jpg, 1.jpg, 02.jpg, 2.jpg 등 다 시도. 중간 gap 허용.
    const images = [];
    for (let i = 1; i <= MAX_TRIES; i++) {
      const padded = String(i).padStart(2, "0");
      const noPad = String(i);
      const exts = ["jpg", "jpeg", "png", "webp"];
      let found = null;
      for (const num of [padded, noPad]) {
        for (const ext of exts) {
          const url = `/images/${folder}/${num}.${ext}`;
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
        if (found) break;
      }
      if (found) images.push(found);
      // gap 허용: 못 찾았어도 break 안 함 (1, 3, 5 같이 띄엄띄엄 OK)
    }
    return images;
  }

  function renderPlaceholder(carousel, folder) {
    const stage = carousel.querySelector("[data-stage]");
    const prevBtn = carousel.querySelector("[data-prev]");
    const nextBtn = carousel.querySelector("[data-next]");
    const dotsContainer = carousel.querySelector("[data-dots]");

    if (stage) {
      stage.innerHTML = `
        <div class="carousel__placeholder">
          이미지를 추가하면 여기에 보입니다<br />
          <span style="font-size: 11px; opacity: 0.6; margin-top: 10px; display: inline-block;">/images/${folder}/01.jpg ~</span>
        </div>
      `;
    }
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
    if (dotsContainer) dotsContainer.style.display = "none";
  }

  function hideWork(carousel) {
    // 작품 carousel은 이미지 없으면 work 자체를 숨김 (placeholder 대신)
    const work = carousel.closest(".work");
    if (work) {
      const figure = work.querySelector(".work__carousel");
      if (figure) figure.style.display = "none";
    }
  }

  function renderCarousel(carousel, images, folder) {
    const stage = carousel.querySelector("[data-stage]");
    const dotsContainer = carousel.querySelector("[data-dots]");
    const prevBtn = carousel.querySelector("[data-prev]");
    const nextBtn = carousel.querySelector("[data-next]");

    let active = 0;

    stage.innerHTML = "";
    images.forEach((url, idx) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      if (idx === 0) img.classList.add("is-active");
      stage.appendChild(img);
    });

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

    // 키보드 좌우 — Hero carousel (weave-cards) 만
    if (folder === KB_FOLDER) {
      document.addEventListener("keydown", (e) => {
        // input·textarea 포커스 시 무시
        if (
          document.activeElement &&
          ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
        )
          return;
        if (e.key === "ArrowLeft") goto(active - 1);
        if (e.key === "ArrowRight") goto(active + 1);
      });
    }

    if (images.length === 1) {
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
      if (dotsContainer) dotsContainer.style.display = "none";
    }
  }

  // 모든 carousel 인스턴스 초기화
  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const folder = carousel.getAttribute("data-carousel-folder");
    if (!folder) return;
    const isWork = carousel.classList.contains("work__carousel");

    detectImages(folder).then((images) => {
      if (images.length === 0) {
        if (isWork) {
          hideWork(carousel);
        } else {
          renderPlaceholder(carousel, folder);
        }
      } else {
        renderCarousel(carousel, images, folder);
      }
    });
  });
})();
