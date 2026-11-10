'use client';
import {useEffect} from 'react';

/* Scroll and motion behavior for the landing page. Renders nothing; it only wires up the markup in app/page.tsx. */
export default function LandingEffects(){
  useEffect(()=>{
    const root=document.querySelector<HTMLElement>('.lp');
    if(!root) return;
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasIO='IntersectionObserver' in window;
    const cleanups:Array<()=>void>=[];
    const on=<K extends keyof WindowEventMap>(type:K,fn:()=>void,opts?:AddEventListenerOptions)=>{
      window.addEventListener(type,fn,opts);cleanups.push(()=>window.removeEventListener(type,fn));
    };
    if(!reduce) root.classList.add('lp-js');
    cleanups.push(()=>root.classList.remove('lp-js'));

    // Floating nav gets a stronger background once the page scrolls.
    const nav=root.querySelector<HTMLElement>('.lp-nav');
    const onScrollNav=()=>nav?.classList.toggle('lp-scrolled',window.scrollY>24);
    onScrollNav();on('scroll',onScrollNav,{passive:true});

    // Keep primary navigation synchronized with the section in view.
    // The active state is a location indicator, not a separate route.
    const navLinks=Array.from(root.querySelectorAll<HTMLAnchorElement>('.lp-nav-link[href^="#"]'));
    const navTargets=navLinks.map(link=>({
      link,id:(link.getAttribute('href')||'').slice(1)
    })).filter(item=>item.id.length>0);
    let activeSection:string|null=null;
    const setActiveSection=(id:string)=>{
      if(id===activeSection)return;
      activeSection=id;
      navTargets.forEach(({link,id:target})=>{
        const active=target===id;
        link.classList.toggle('lp-active',active);
        if(active)link.setAttribute('aria-current','location');
        else link.removeAttribute('aria-current');
      });
    };
    const syncActiveSection=()=>{
      const scanLine=Math.min(270,window.innerHeight*.35);
      let id='';
      navTargets.forEach(({id:target})=>{
        const section=document.getElementById(target);
        if(section&&section.getBoundingClientRect().top<=scanLine)id=target;
      });
      setActiveSection(id);
    };
    let navFrame=0;
    const queueActiveSection=()=>{
      if(navFrame)return;
      navFrame=requestAnimationFrame(()=>{
        navFrame=0;
        syncActiveSection();
      });
    };
    navTargets.forEach(({link,id})=>{
      const handleClick=()=>setActiveSection(id);
      link.addEventListener('click',handleClick);
      cleanups.push(()=>link.removeEventListener('click',handleClick));
    });
    syncActiveSection();
    on('scroll',queueActiveSection,{passive:true});
    on('resize',queueActiveSection);
    on('hashchange',queueActiveSection);
    cleanups.push(()=>cancelAnimationFrame(navFrame));

    // Reveal on scroll.
    const reveals=root.querySelectorAll<HTMLElement>('.lp-rv');
    if(hasIO&&!reduce){
      const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('lp-in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px',threshold:.08});
      reveals.forEach(el=>io.observe(el));cleanups.push(()=>io.disconnect());
    } else reveals.forEach(el=>el.classList.add('lp-in'));

    // Count-up stats.
    const stats=root.querySelector<HTMLElement>('.lp-stats');
    if(stats&&hasIO&&!reduce){
      let frame=0;
      const so=new IntersectionObserver(es=>{
        if(!es[0].isIntersecting) return;
        so.disconnect();
        root.querySelectorAll<HTMLElement>('[data-count]').forEach(el=>{
          const to=Number(el.dataset.count),t0=performance.now(),dur=1400;
          const step=(t:number)=>{
            const p=Math.min(1,(t-t0)/dur);
            el.textContent=String(Math.round(to*(1-Math.pow(1-p,3))));
            if(p<1) frame=requestAnimationFrame(step);
          };
          frame=requestAnimationFrame(step);
        });
      },{threshold:.4});
      so.observe(stats);cleanups.push(()=>{so.disconnect();cancelAnimationFrame(frame)});
    }

    // Scroll-linked statement: words light up as the block moves through the viewport.
    const statement=root.querySelector<HTMLElement>('#statement');
    const words=statement?Array.from(statement.querySelectorAll<HTMLElement>('.lp-w')):[];
    if(statement&&!reduce){
      const paint=()=>{
        const r=statement.getBoundingClientRect(),vh=window.innerHeight;
        const p=Math.min(1,Math.max(0,(vh*.85-r.top)/(r.height+vh*.35)));
        const n=Math.round(p*words.length*1.08);
        words.forEach((w,i)=>w.classList.toggle('lp-on',i<n));
      };
      paint();on('scroll',paint,{passive:true});on('resize',paint);
    } else words.forEach(w=>w.classList.add('lp-on'));

    // Stage walkthrough: the step nearest the middle of the screen drives the sticky panel.
    const steps=Array.from(root.querySelectorAll<HTMLElement>('.lp-step'));
    const panels=Array.from(root.querySelectorAll<HTMLElement>('.lp-panel'));
    const setStage=(i:number)=>{
      steps.forEach((s,k)=>s.classList.toggle('lp-on',k===i));
      panels.forEach((p,k)=>p.classList.toggle('lp-on',k===i));
    };
    let ticking=false,raf=0;
    const pick=()=>{
      ticking=false;
      const line=window.innerHeight*(window.innerWidth<=900?.62:.5);
      let cur=0;steps.forEach((s,k)=>{if(s.getBoundingClientRect().top<line) cur=k});
      setStage(cur);
    };
    const onScrollStage=()=>{if(!ticking){ticking=true;raf=requestAnimationFrame(pick)}};
    on('scroll',onScrollStage,{passive:true});on('resize',pick);pick();
    cleanups.push(()=>cancelAnimationFrame(raf));

    // Orbit: the seven stages circle the verified-recovery coin.
    const orbit=root.querySelector<HTMLElement>('#orbit');
    if(orbit){
      const chips=Array.from(orbit.querySelectorAll<HTMLElement>('.lp-chip'));
      const t0=performance.now();
      let running=true,orbitFrame=0;
      const place=(ts:number)=>{
        const w=orbit.clientWidth,h=orbit.clientHeight,rx=w*.43,ry=h*.28,cx=w/2,cy=h*.5;
        const ang=reduce?0:(ts-t0)/1000*.28;
        chips.forEach((c,i)=>{
          const a=ang+i*(Math.PI*2/chips.length),x=Math.cos(a),y=Math.sin(a),depth=(y+1)/2,s=.78+depth*.3;
          c.style.transform=`translate(${cx+x*rx-c.offsetWidth/2}px,${cy+y*ry-c.offsetHeight/2}px) scale(${s})`;
          c.style.zIndex=y>0?'7':'3';c.style.opacity=String(.55+depth*.45);
        });
        if(!reduce&&running) orbitFrame=requestAnimationFrame(place);
      };
      orbitFrame=requestAnimationFrame(place);
      if(reduce) on('resize',()=>place(performance.now()));
      if(hasIO&&!reduce){
        const oo=new IntersectionObserver(es=>{
          const visible=es[0].isIntersecting;
          if(visible&&!running){running=true;orbitFrame=requestAnimationFrame(place)} else if(!visible) running=false;
        });
        oo.observe(orbit);cleanups.push(()=>oo.disconnect());
      }
      cleanups.push(()=>{running=false;cancelAnimationFrame(orbitFrame)});
    }

    // FAQ: keep one answer open at a time.
    const details=Array.from(root.querySelectorAll<HTMLDetailsElement>('details'));
    details.forEach(d=>{
      const onToggle=()=>{if(d.open) details.forEach(o=>{if(o!==d) o.open=false})};
      d.addEventListener('toggle',onToggle);cleanups.push(()=>d.removeEventListener('toggle',onToggle));
    });

    return()=>cleanups.forEach(fn=>fn());
  },[]);
  return null;
}
