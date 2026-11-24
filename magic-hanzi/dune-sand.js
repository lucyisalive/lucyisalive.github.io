(function (window) {
  'use strict';

  const WIDTH = 900;
  const HEIGHT = 1200;
  const MAX_PARTICLES = 950;
  const GRAIN_COLORS = ['#e0b36d', '#b77d3e', '#d19b55', '#8c592e', '#edc78a'];

  function create({canvas, document: doc}) {
    const view = doc?.defaultView || window;
    let context;
    try { context = canvas?.getContext?.('2d', {alpha:true}); }
    catch (_) { /* The scene remains available if canvas drawing is blocked. */ }
    const inert = {gust() {}, eruption() {}, landing() {}, stop() {}};
    if (!context || !view.requestAnimationFrame) return inert;

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const dust = doc.createElement('canvas');
    dust.width = dust.height = 96;
    const dustContext = dust.getContext('2d');
    if (!dustContext) return inert;
    const cloud = dustContext.createRadialGradient(48,48,3,48,48,47);
    cloud.addColorStop(0,'#bd8a50b0');
    cloud.addColorStop(.25,'#bb865593');
    cloud.addColorStop(.59,'#b7834a46');
    cloud.addColorStop(1,'#a8753b00');
    dustContext.fillStyle = cloud;
    dustContext.fillRect(0,0,96,96);

    let particles = [];
    let frame = 0;
    let previousTime = 0;
    let seed = 3917;

    // Repeatable irregularity keeps replays comparable while avoiding rigid jets.
    function random() {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const between = (minimum,maximum) => minimum + random() * (maximum-minimum);
    const reduced = () => view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    function stop() {
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      particles = [];
      context.clearRect(0,0,WIDTH,HEIGHT);
    }

    function render(now) {
      frame = 0;
      if (reduced()) { stop(); return; }
      const elapsed = previousTime ? Math.min((now-previousTime)/1000,.05) : 0;
      previousTime = now;
      context.clearRect(0,0,WIDTH,HEIGHT);
      particles = particles.filter(particle => {
        particle.age += elapsed;
        return particle.age < particle.life;
      });

      for (const particle of particles) {
        if (particle.age < 0) continue;
        const progress = particle.age / particle.life;
        const fade = Math.min(1,particle.age/.08) * Math.pow(1-progress,particle.cloud ? 1.25 : .65);
        const x = particle.x + particle.vx * particle.age;
        const y = particle.y + particle.vy * particle.age + particle.gravity * particle.age * particle.age / 2;
        if (particle.cloud) {
          const spread = 1 + progress * particle.spread;
          const size = particle.size * spread;
          context.globalAlpha = fade * particle.opacity;
          context.save();
          context.translate(x,y);
          context.rotate(particle.angle + progress * particle.turn);
          context.drawImage(dust,-size,-size*particle.tall,size*2,size*2*particle.tall);
          context.restore();
        } else {
          context.globalAlpha = fade * particle.opacity;
          context.fillStyle = particle.color;
          context.fillRect(x,y,particle.size,particle.size * particle.tall);
        }
      }
      context.globalAlpha = 1;
      if (particles.length) frame = view.requestAnimationFrame(render);
      else previousTime = 0;
    }

    function start(next) {
      if (reduced()) return;
      particles = particles.concat(next).slice(-MAX_PARTICLES);
      if (!frame) frame = view.requestAnimationFrame(render);
    }

    function grain(x,y,scale,delay,life,vx,vy,gravity) {
      return {x,y,vx,vy,gravity,age:-delay,life,cloud:false,
        size:between(.75,2.9)*scale, tall:between(.65,1.35),
        opacity:between(.45,.95), color:GRAIN_COLORS[Math.floor(random()*GRAIN_COLORS.length)]};
    }

    function puff(x,y,size,delay,life,vx,vy,gravity,opacity,tall) {
      return {x,y,vx,vy,gravity,age:-delay,life,cloud:true,size,opacity,tall,
        angle:between(-.3,.3), turn:between(-.5,.5), spread:between(1.1,2.4)};
    }

    function gust(xPercent,yPercent,sizePercent=9) {
      if (reduced()) return;
      const x = xPercent * WIDTH / 100, y = yPercent * HEIGHT / 100;
      const size = Math.max(10,sizePercent * WIDTH / 100);
      const next = [];
      for (let index=0; index<9; index++) {
        next.push(puff(x+between(-.5,.5)*size,y+between(-.13,.13)*size,
          size*.25,between(0,.12),between(.65,.95),between(-.7,1)*size,
          between(-.7,-.2)*size,35,.23,.45));
      }
      for (let index=0; index<72; index++) {
        next.push(grain(x+between(-.4,.4)*size,y+between(-.1,.1)*size,
          .45,between(0,.12),between(.4,.85),between(-1.4,1.5)*size,
          between(-1.4,-.3)*size,210));
      }
      start(next);
    }

    function eruption(xPercent=63,yPercent=43) {
      if (reduced()) return;
      const x = xPercent * WIDTH / 100, y = yPercent * HEIGHT / 100;
      const next = [];
      // Low, dense rolling sand hides the exact moment the body breaks the ridge.
      for (let index=0; index<32; index++) {
        const side = index%2 ? 1 : -1;
        next.push(puff(x+between(-45,45),y+between(-8,18),between(30,57),
          between(0,.7),between(1.65,2.3),side*between(45,175),between(-42,-10),
          18,between(.24,.46),between(.4,.65)));
      }
      // Higher turbulent puffs accompany the upward fountain and drift sideways.
      for (let index=0; index<24; index++) {
        next.push(puff(x+between(-22,22),y,between(17,33),between(.05,.85),
          between(1.5,2.25),between(-95,100),between(-210,-105),85,
          between(.18,.33),between(.65,1)));
      }
      for (let index=0; index<540; index++) {
        const coarse = index < 130;
        next.push(grain(x+between(-42,42),y+between(-8,12),coarse?1.2:.55,
          between(0,1),between(1.15,2),between(-220,220),
          between(coarse?-440:-360,-155),between(280,430)));
      }
      start(next);
    }

    function landing(xPercent=50,yPercent=69) {
      if (reduced()) return;
      const x = xPercent * WIDTH / 100, y = yPercent * HEIGHT / 100;
      const next = [];
      for (let index=0; index<30; index++) {
        const side = index%2 ? 1 : -1;
        next.push(puff(x+between(-70,70),y+between(-7,7),between(22,43),
          between(0,.2),between(.9,1.45),side*between(70,190),between(-42,-10),
          24,between(.2,.36),between(.23,.4)));
      }
      for (let index=0; index<170; index++) {
        const side = index%2 ? 1 : -1;
        next.push(grain(x+between(-65,65),y,.75,between(0,.18),between(.55,1.2),
          side*between(90,260),between(-110,-35),210));
      }
      start(next);
    }

    return {gust,eruption,landing,stop};
  }

  window.HanziDuneSand = Object.freeze({create});
})(window);
