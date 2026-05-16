// Carousel — Hero 및 각 work 섹션에서 재사용.
// data-carousel-folder="weave-cards" 같이 폴더 path 받음.
// /images/<folder>/01.jpg, 02.jpg, ... 자동 감지.

(function () {
  const MAX_TRIES = 12;
  const KB_FOLDER = "weave-cards"; // 키보드 ←→ 활성 carousel 폴더

  async function detectImages(folder) {
    // 1순위: manifest.json (사용자 파일명 자유)
    try {
      const res = await fetch(`/images/${folder}/manifest.json`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          return list.map((name) => `/images/${folder}/${name}`);
        }
      }
    } catch (_) {
      // manifest 없으면 fallback
    }

    // 2순위: 01.jpg, 1.jpg, 02.jpg 등 숫자 자동 감지. gap 허용.
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

  // === Break image — /images/breaks/ 안 첫 이미지를 풀 너비 background로 ===
  document.querySelectorAll("[data-break-image]").forEach((el) => {
    detectImages("breaks").then((images) => {
      if (images.length === 0) {
        el.classList.add("break-image--empty");
        // page-wrap도 같이 숨김 (sticky context 제거)
        const wrap = el.closest("[data-break-wrap]");
        if (wrap) wrap.style.display = "none";
        return;
      }
      el.style.backgroundImage = "url(" + images[0] + ")";
    });
  });

  // === Philosophy bg — pre-load 후 fade-in (갑자기 뜨지 않음) ===
  document.querySelectorAll("[data-philosophy-bg]").forEach((el) => {
    detectImages("philosophy").then((images) => {
      if (images.length === 0) return;
      const preload = new Image();
      preload.onload = () => {
        el.style.backgroundImage = "url(" + images[0] + ")";
        // 다음 frame에 class 추가 (transition 트리거)
        requestAnimationFrame(() => el.classList.add("is-loaded"));
      };
      preload.src = images[0];
    });
  });

  // === Works slide bg — /images/<folder>/bg.png 또는 bg.jpg ===
  document.querySelectorAll("[data-bg-folder]").forEach((el) => {
    const folder = el.getAttribute("data-bg-folder");
    if (!folder) return;
    function tryLoad(exts) {
      if (exts.length === 0) return;
      const ext = exts[0];
      const url = `/images/${folder}/bg.${ext}`;
      const img = new Image();
      img.onload = () => {
        el.style.backgroundImage = "url(" + url + ")";
        requestAnimationFrame(() => el.classList.add("is-loaded"));
      };
      img.onerror = () => tryLoad(exts.slice(1));
      img.src = url;
    }
    tryLoad(["png", "jpg", "jpeg", "webp"]);
  });

  // === Cards row (Kinfolk Inside Issue grid 결) — Philosophy·Works ===
  document.querySelectorAll("[data-cards]").forEach((row) => {
    const folder = row.getAttribute("data-cards-folder");
    if (!folder) return;
    const skipFirst = row.getAttribute("data-skip-first") === "true";

    detectImages(folder).then((images) => {
      if (skipFirst) images = images.slice(1);
      if (images.length === 0) {
        // 이미지 없으면 그 row가 속한 work 전체를 숨김 (header 까지)
        const parentWork = row.closest(".work");
        if (parentWork) {
          parentWork.style.display = "none";
        } else {
          row.style.display = "none";
        }
        return;
      }
      images.forEach((url) => {
        const card = document.createElement("div");
        card.className = "cards-row__card";
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("load", () => {
          requestAnimationFrame(() => img.classList.add("is-loaded"));
        });
        img.src = url;
        card.appendChild(img);
        row.appendChild(card);
      });

      // works-slide 안 cards-row 만 coverflow 결 적용 (중앙 강조 + 양옆 흐림)
      const isWorksCards = row.closest(".works-slide__cards");
      if (isWorksCards) {
        setupCoverflow(row, images.length);
      }
    });
  });

  // === Coverflow 결: 중앙 카드 강조 + 양옆 카드 작고 흐림. 옆 카드 클릭·swipe 로 이동 ===
  function setupCoverflow(row, count) {
    if (count <= 1) return;
    let activeIdx = 0;
    const STEP_DESKTOP = 360; // 카드 간 가로 거리 (데스크탑, 카드 1.5배 키워서 비례)
    const STEP_MOBILE = 230;  // 모바일

    function step() {
      return window.matchMedia("(max-width: 720px)").matches ? STEP_MOBILE : STEP_DESKTOP;
    }

    function update() {
      const cards = row.querySelectorAll(".cards-row__card");
      const STEP = step();
      cards.forEach((card, i) => {
        const offset = i - activeIdx;
        const abs = Math.abs(offset);
        const scale = offset === 0 ? 1 : (abs === 1 ? 0.78 : 0.6);
        const opacity = offset === 0 ? 1 : (abs === 1 ? 0.35 : 0);
        card.style.transform = "translate(calc(-50% + " + (offset * STEP) + "px), -50%) scale(" + scale + ")";
        card.style.opacity = opacity;
        card.style.zIndex = offset === 0 ? 3 : (abs === 1 ? 2 : 0);
        card.style.pointerEvents = abs <= 1 ? "auto" : "none";
        card.classList.toggle("is-center", offset === 0);
      });
    }

    function goto(i) {
      activeIdx = ((i % count) + count) % count;
      update();
    }

    // 옆 카드 클릭 시 가운데로 (활성 카드는 안 움직임)
    row.querySelectorAll(".cards-row__card").forEach((card, i) => {
      card.addEventListener("click", () => {
        if (i !== activeIdx) goto(i);
      });
    });

    // 터치 swipe (모바일)
    let startX = 0;
    let dragging = false;
    row.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      dragging = true;
    }, { passive: true });
    row.addEventListener("touchend", (e) => {
      if (!dragging) return;
      const endX = e.changedTouches[0].clientX;
      const diff = endX - startX;
      if (Math.abs(diff) > 40) {
        goto(activeIdx + (diff > 0 ? -1 : 1));
      }
      dragging = false;
    }, { passive: true });

    // 화면 사이즈 변경 시 step 재계산
    window.addEventListener("resize", update);

    update();
  }
})();
