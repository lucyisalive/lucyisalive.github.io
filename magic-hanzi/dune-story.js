(function (window) {
  'use strict';

  // The paired tracks bend around the dune and turn back toward its ridge.
  const FOOTPRINTS = [
    [28,81,11.2,20], [43,76,10.2,33],
    [44,70.7,9.3,20], [60,67,8.3,34],
    [63,61.5,7.5,15], [77,58.2,6.4,-8],
    [64,53.2,5.7,-28], [70,49.8,4.7,-33],
    [54,46.8,4,-21], [63,43.4,3.4,9]
  ];
  const ARRIVAL_TIME = 5400;
  const RIDING_TIME = 4700;

  function create({document:doc}) {
    const scene = doc.createElement('div');
    scene.className = 'story-dune';
    scene.hidden = true;
    scene.setAttribute('aria-hidden','true');
    scene.innerHTML = `
      <div class="dune-frame">
        <div class="dune-world">
          <div class="dune-landscape"></div>
          <div class="dune-distant-haze"></div>
          <div class="dune-footprints">
            ${FOOTPRINTS.map(([x,y,size,angle],index) => `
              <span class="dune-footprint" data-print="${index+1}"
                style="--print-x:${x}%;--print-y:${y}%;--print-size:${size}%;--print-angle:${angle}deg">
                <i class="dune-heel"></i><i class="dune-toe"></i><i class="dune-toe"></i><i class="dune-toe"></i>
              </span>`).join('')}
          </div>
          <div class="dune-dragon-shadow"></div>
          <div class="dune-dragon"><img src="assets/story/dune-dragon-hornless-v2.webp" alt="" draggable="false"></div>
          <div class="dune-ridge-mask"></div>
          <canvas class="dune-sand"></canvas>
          <div class="dune-low-drift"></div>
        </div>
        <div class="dune-flight-view">
          <div class="dune-flight-land"></div>
          <div class="dune-flight-haze"></div>
          <div class="dune-rider">
            <img src="assets/story/dragon-riding-hornless-v2.webp" alt="" draggable="false">
          </div>
          <div class="dune-flight-wind"></div>
        </div>
        <div class="dune-vignette"></div>
      </div>`;
    doc.body.insertBefore(scene,doc.body.firstChild);

    const marks = Array.from(scene.querySelectorAll('.dune-footprint'));
    const sand = window.HanziDuneSand?.create({canvas:scene.querySelector('.dune-sand'),document:doc});
    const timers = new Set();
    const reduced = () => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let previousCount = 0;
    let active = false;

    function later(callback,delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if(active)callback();
      },delay);
      timers.add(timer);
    }

    function resetExit() {
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
      sand?.stop();
      scene.classList.remove('is-riding','dragon-arrives');
    }

    function render(stage,value,animate=false) {
      const visible = stage==='dunes';
      scene.hidden = !visible;
      if(!visible) {
        resetExit();
        active = false;
        return;
      }
      const count = Math.min(10,Math.max(0,Math.floor(Number(value)||0)));
      const advancing = active && count>previousCount;
      if(count<previousCount || !active)resetExit();
      active = true;

      marks.forEach((mark,index) => {
        mark.classList.toggle('is-revealed',index<count);
        mark.classList.remove('is-rising');
        if(index<count && index>=previousCount && animate && advancing) {
          mark.getBoundingClientRect();
          mark.classList.add('is-rising');
          const [x,y,size] = FOOTPRINTS[index];
          sand?.gust(x,y,size);
        }
      });
      scene.classList.toggle('is-complete',count===10);
      if(count===10 && previousCount<10 && animate && !reduced()) {
        sand?.stop();
        scene.classList.remove('dragon-arrives');
        scene.getBoundingClientRect();
        scene.classList.add('dragon-arrives');
        later(() => sand?.eruption(63,41),250);
        later(() => sand?.landing(50,69),3950);
        later(() => scene.classList.remove('dragon-arrives'),ARRIVAL_TIME);
      }
      scene.dataset.count = String(count);
      previousCount = count;
    }

    function playExit(stage) {
      if(stage!=='dunes' || previousCount!==10 || !active)return 0;
      resetExit();
      scene.getBoundingClientRect();
      scene.classList.add('is-riding');
      return reduced()?0:RIDING_TIME;
    }

    return {render,playExit,resetExit,arrivalTime:ARRIVAL_TIME};
  }

  window.HanziDuneStory = {create};
})(window);
