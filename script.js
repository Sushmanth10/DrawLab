const { useState, useRef, useEffect, useCallback } = React;

/* ─── Constants ─────────────────────────────────── */
const CANVAS_W = 4000;   // logical canvas pixels
const CANVAS_H = 3000;

const PALETTE = [
  '#f5f0e8','#ff4d1c','#ffde59','#4ecdc4','#45b7d1',
  '#96ceb4','#ff6b9d','#c77dff','#3d9970','#ff9f43',
  '#0d0d0d','#555',   '#888',   '#1565c0','#b71c1c',
];

const TOOLS = [
  { id:'pen',        icon:'✏️',  label:'Pen' },
  { id:'brush',      icon:'🖌️',  label:'Brush' },
  { id:'spray',      icon:'💨',  label:'Spray' },
  { id:'eraser',     icon:'🧹',  label:'Eraser' },
  { id:'fill',       icon:'🪣',  label:'Fill' },
  { id:'eyedropper', icon:'💉',  label:'Eyedropper' },
  { id:'shape',      icon:'⬜',  label:'Shapes' },
  { id:'line',       icon:'╱',   label:'Line' },
  { id:'text',       icon:'𝐓',   label:'Text' },
];

const SHAPES = [
  // Basic
  { id:'rect',          icon:'▭', label:'Rectangle' },
  { id:'roundrect',     icon:'▢', label:'Rounded Rect' },
  { id:'circle',        icon:'○', label:'Ellipse' },
  { id:'triangle',      icon:'△', label:'Triangle' },
  { id:'rtriangle',     icon:'◁', label:'Right Triangle' },
  { id:'diamond',       icon:'◇', label:'Diamond' },
  { id:'pentagon',      icon:'⬠', label:'Pentagon' },
  { id:'hexagon',       icon:'⬡', label:'Hexagon' },
  { id:'parallelogram', icon:'▱', label:'Parallelogram' },
  { id:'trapezoid',     icon:'⏢', label:'Trapezoid' },
  // Arrows
  { id:'arrow_right',   icon:'→', label:'Arrow Right' },
  { id:'arrow_left',    icon:'←', label:'Arrow Left' },
  { id:'arrow_up',      icon:'↑', label:'Arrow Up' },
  { id:'arrow_down',    icon:'↓', label:'Arrow Down' },
  { id:'arrow_both',    icon:'↔', label:'Double Arrow' },
  { id:'arrow_curved',  icon:'↪', label:'Curved Arrow' },
  { id:'arrow_block',   icon:'➡', label:'Block Arrow' },
  { id:'arrow_chevron', icon:'›', label:'Chevron' },
  { id:'arrow_notch',   icon:'⊳', label:'Notched Arrow' },
  // Callouts / Pointers
  { id:'callout_rect',  icon:'💬', label:'Callout Box' },
  { id:'callout_round', icon:'🗨', label:'Callout Round' },
  { id:'pointer_pin',   icon:'📍', label:'Location Pin' },
  { id:'pointer_tag',   icon:'🏷', label:'Tag' },
  // Stars / Specials
  { id:'star4',   icon:'✦', label:'4-Point Star' },
  { id:'star5',   icon:'★', label:'5-Point Star' },
  { id:'star6',   icon:'✶', label:'6-Point Star' },
  { id:'cross',   icon:'✚', label:'Cross' },
  { id:'plus',    icon:'+', label:'Plus' },
  { id:'cloud',   icon:'☁', label:'Cloud' },
  { id:'heart',   icon:'♥', label:'Heart' },
  { id:'cylinder',icon:'⬭', label:'Cylinder' },
];

/* ─── Utility: hex → [r,g,b] ─── */
function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

/* ─── Flood fill ─── */
function floodFill(ctx, x, y, fillColor) {
  const { width, height } = ctx.canvas;
  const img = ctx.getImageData(0,0,width,height);
  const d   = img.data;
  const i0  = (Math.floor(y)*width + Math.floor(x))*4;
  const [tr,tg,tb,ta] = [d[i0],d[i0+1],d[i0+2],d[i0+3]];
  const [fr,fg,fb]    = hexToRgb(fillColor);
  if (tr===fr&&tg===fg&&tb===fb) return;
  const stack = [[Math.floor(x),Math.floor(y)]];
  while (stack.length) {
    const [cx,cy] = stack.pop();
    if (cx<0||cy<0||cx>=width||cy>=height) continue;
    const i = (cy*width+cx)*4;
    if (d[i]!==tr||d[i+1]!==tg||d[i+2]!==tb||d[i+3]!==ta) continue;
    d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255;
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
  ctx.putImageData(img,0,0);
}

/* ─── Helpers for complex shapes ─── */
function starPath(ctx,cx,cy,outerR,innerR,pts) {
  ctx.beginPath();
  for (let i=0;i<pts*2;i++) {
    const r=i%2===0?outerR:innerR, a=(i*Math.PI/pts)-Math.PI/2;
    i===0?ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a)):ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));
  }
  ctx.closePath();
}
function polyPath(ctx,cx,cy,r,sides,off=0) {
  ctx.beginPath();
  for (let i=0;i<sides;i++){const a=(2*Math.PI*i/sides)+off; i===0?ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a)):ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}
  ctx.closePath();
}

/* ─── Draw any shape onto ctx ─── */
function drawShape(ctx,x1,y1,x2,y2,id,filled) {
  const w=x2-x1, h=y2-y1, cx=x1+w/2, cy=y1+h/2;
  const rw=Math.abs(w)/2, rh=Math.abs(h)/2, r=Math.min(rw,rh);
  const hl=Math.max(16,r*0.35), hw=Math.max(8,r*0.25);
  const go=()=>filled?ctx.fill():ctx.stroke();
  switch(id){
    case 'rect':         ctx.beginPath();ctx.rect(x1,y1,w,h);go();break;
    case 'roundrect':    ctx.beginPath();ctx.roundRect(x1,y1,w,h,Math.min(rw,rh)*0.15);go();break;
    case 'circle':       ctx.beginPath();ctx.ellipse(cx,cy,rw,rh,0,0,Math.PI*2);go();break;
    case 'triangle':     ctx.beginPath();ctx.moveTo(cx,y1);ctx.lineTo(x2,y2);ctx.lineTo(x1,y2);ctx.closePath();go();break;
    case 'rtriangle':    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x1,y2);ctx.closePath();go();break;
    case 'diamond':      ctx.beginPath();ctx.moveTo(cx,y1);ctx.lineTo(x2,cy);ctx.lineTo(cx,y2);ctx.lineTo(x1,cy);ctx.closePath();go();break;
    case 'pentagon':     polyPath(ctx,cx,cy,r,5,-Math.PI/2);go();break;
    case 'hexagon':      polyPath(ctx,cx,cy,r,6,0);go();break;
    case 'parallelogram':{const sk=Math.abs(w)*0.2;ctx.beginPath();ctx.moveTo(x1+sk,y1);ctx.lineTo(x2,y1);ctx.lineTo(x2-sk,y2);ctx.lineTo(x1,y2);ctx.closePath();go();break;}
    case 'trapezoid':    {const i2=Math.abs(w)*0.2;ctx.beginPath();ctx.moveTo(x1+i2,y1);ctx.lineTo(x2-i2,y1);ctx.lineTo(x2,y2);ctx.lineTo(x1,y2);ctx.closePath();go();break;}
    case 'arrow_right':  ctx.beginPath();ctx.moveTo(x1,cy-hw);ctx.lineTo(x2-hl,cy-hw);ctx.lineTo(x2-hl,cy-hl);ctx.lineTo(x2,cy);ctx.lineTo(x2-hl,cy+hl);ctx.lineTo(x2-hl,cy+hw);ctx.lineTo(x1,cy+hw);ctx.closePath();go();break;
    case 'arrow_left':   ctx.beginPath();ctx.moveTo(x2,cy-hw);ctx.lineTo(x1+hl,cy-hw);ctx.lineTo(x1+hl,cy-hl);ctx.lineTo(x1,cy);ctx.lineTo(x1+hl,cy+hl);ctx.lineTo(x1+hl,cy+hw);ctx.lineTo(x2,cy+hw);ctx.closePath();go();break;
    case 'arrow_up':     ctx.beginPath();ctx.moveTo(cx-hw,y2);ctx.lineTo(cx-hw,y1+hl);ctx.lineTo(cx-hl,y1+hl);ctx.lineTo(cx,y1);ctx.lineTo(cx+hl,y1+hl);ctx.lineTo(cx+hw,y1+hl);ctx.lineTo(cx+hw,y2);ctx.closePath();go();break;
    case 'arrow_down':   ctx.beginPath();ctx.moveTo(cx-hw,y1);ctx.lineTo(cx-hw,y2-hl);ctx.lineTo(cx-hl,y2-hl);ctx.lineTo(cx,y2);ctx.lineTo(cx+hl,y2-hl);ctx.lineTo(cx+hw,y2-hl);ctx.lineTo(cx+hw,y1);ctx.closePath();go();break;
    case 'arrow_both':   ctx.beginPath();ctx.moveTo(x1,cy);ctx.lineTo(x1+hl,cy-hl);ctx.lineTo(x1+hl,cy-hw);ctx.lineTo(x2-hl,cy-hw);ctx.lineTo(x2-hl,cy-hl);ctx.lineTo(x2,cy);ctx.lineTo(x2-hl,cy+hl);ctx.lineTo(x2-hl,cy+hw);ctx.lineTo(x1+hl,cy+hw);ctx.lineTo(x1+hl,cy+hl);ctx.closePath();go();break;
    case 'arrow_curved': {
      const ar=r*0.9;
      ctx.beginPath();ctx.arc(cx,cy+rh*0.3,ar,Math.PI+0.3,Math.PI*2-0.3);ctx.stroke();
      const ex=cx+ar*Math.cos(Math.PI*2-0.3),ey=cy+rh*0.3+ar*Math.sin(Math.PI*2-0.3);
      ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-hl*0.7,ey-hl);ctx.lineTo(ex+hl*0.5,ey-hl*0.3);ctx.closePath();ctx.fill();break;
    }
    case 'arrow_block':  ctx.beginPath();ctx.moveTo(x1,cy-rh*0.4);ctx.lineTo(x2-hl*1.4,cy-rh*0.4);ctx.lineTo(x2-hl*1.4,y1);ctx.lineTo(x2,cy);ctx.lineTo(x2-hl*1.4,y2);ctx.lineTo(x2-hl*1.4,cy+rh*0.4);ctx.lineTo(x1,cy+rh*0.4);ctx.closePath();go();break;
    case 'arrow_chevron':ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(cx,cy);ctx.lineTo(x1,y2);ctx.moveTo(cx,y1);ctx.lineTo(x2,cy);ctx.lineTo(cx,y2);ctx.stroke();break;
    case 'arrow_notch':  ctx.beginPath();ctx.moveTo(x1,cy);ctx.lineTo(x1+rw*0.5,y1);ctx.lineTo(x2,cy);ctx.lineTo(x1+rw*0.5,y2);ctx.closePath();go();break;
    case 'callout_rect': {
      ctx.beginPath();ctx.roundRect(x1,y1,w,h*0.75,8);go();
      ctx.beginPath();ctx.moveTo(cx-hw,y1+h*0.75);ctx.lineTo(cx,y2);ctx.lineTo(cx+hw,y1+h*0.75);ctx.closePath();go();break;
    }
    case 'callout_round':{
      ctx.beginPath();ctx.ellipse(cx,y1+rh*0.7,rw,rh*0.7,0,0,Math.PI*2);go();
      ctx.beginPath();ctx.moveTo(cx-hw*0.5,y1+rh*1.3);ctx.lineTo(cx,y2);ctx.lineTo(cx+hw*0.5,y1+rh*1.3);ctx.closePath();go();break;
    }
    case 'pointer_pin':  ctx.beginPath();ctx.arc(cx,y1+r*0.65,r*0.65,0,Math.PI*2);go();ctx.beginPath();ctx.moveTo(cx,y1+r*1.3);ctx.lineTo(cx,y2);ctx.stroke();break;
    case 'pointer_tag':  {
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2-rw*0.4,y1);ctx.lineTo(x2,cy);ctx.lineTo(x2-rw*0.4,y2);ctx.lineTo(x1,y2);ctx.closePath();go();
      ctx.beginPath();ctx.arc(x1+rw*0.25,cy,rh*0.12,0,Math.PI*2);ctx.fillStyle=filled?'#000':ctx.strokeStyle;ctx.fill();break;
    }
    case 'star4':    starPath(ctx,cx,cy,r,r*0.4,4);go();break;
    case 'star5':    starPath(ctx,cx,cy,r,r*0.4,5);go();break;
    case 'star6':    starPath(ctx,cx,cy,r,r*0.5,6);go();break;
    case 'cross':    {const t=r*0.3;ctx.beginPath();ctx.moveTo(cx-t,y1);ctx.lineTo(cx+t,y1);ctx.lineTo(cx+t,cy-t);ctx.lineTo(x2,cy-t);ctx.lineTo(x2,cy+t);ctx.lineTo(cx+t,cy+t);ctx.lineTo(cx+t,y2);ctx.lineTo(cx-t,y2);ctx.lineTo(cx-t,cy+t);ctx.lineTo(x1,cy+t);ctx.lineTo(x1,cy-t);ctx.lineTo(cx-t,cy-t);ctx.closePath();go();break;}
    case 'plus':     {const t=r*0.28;ctx.beginPath();ctx.moveTo(cx-t,y1);ctx.lineTo(cx+t,y1);ctx.lineTo(cx+t,cy-t);ctx.lineTo(x2,cy-t);ctx.lineTo(x2,cy+t);ctx.lineTo(cx+t,cy+t);ctx.lineTo(cx+t,y2);ctx.lineTo(cx-t,y2);ctx.lineTo(cx-t,cy+t);ctx.lineTo(x1,cy+t);ctx.lineTo(x1,cy-t);ctx.lineTo(cx-t,cy-t);ctx.closePath();go();break;}
    case 'cloud':    {ctx.beginPath();ctx.arc(cx-rw*0.3,cy+rh*0.15,r*0.38,Math.PI*0.5,Math.PI*1.5);ctx.arc(cx-rw*0.05,cy-rh*0.2,r*0.3,Math.PI*1.1,0);ctx.arc(cx+rw*0.2,cy-rh*0.1,r*0.35,Math.PI*1.5,0);ctx.arc(cx+rw*0.4,cy+rh*0.2,r*0.28,Math.PI*1.5,Math.PI*0.5);ctx.arc(cx,cy+rh*0.35,r*0.35,0,Math.PI);ctx.closePath();go();break;}
    case 'heart':    {ctx.beginPath();ctx.moveTo(cx,y2-rh*0.2);ctx.bezierCurveTo(x1,y1+rh*0.8,x1,y1,cx-rw*0.5,y1);ctx.bezierCurveTo(cx,y1,cx,y1+rh*0.2,cx,y1+rh*0.35);ctx.bezierCurveTo(cx,y1+rh*0.2,x2,y1,cx+rw*0.5,y1);ctx.bezierCurveTo(x2,y1,x2,y1+rh*0.8,cx,y2-rh*0.2);ctx.closePath();go();break;}
    case 'cylinder': {const ry2=rh*0.22;ctx.beginPath();ctx.ellipse(cx,y1+ry2,rw,ry2,0,0,Math.PI*2);go();ctx.beginPath();ctx.moveTo(x1,y1+ry2);ctx.lineTo(x1,y2-ry2);ctx.ellipse(cx,y2-ry2,rw,ry2,0,0,Math.PI);ctx.lineTo(x2,y1+ry2);ctx.closePath();go();break;}
    default: break;
  }
}

/* ================================================
   App
   ================================================ */
function App() {
  const canvasRef    = useRef(null);
  const overlayRef   = useRef(null);
  const wrapperRef   = useRef(null);   // the viewport div
  const textInputRef = useRef(null);

  const [tool,         setTool]         = useState('pen');
  const [shape,        setShape]        = useState('rect');
  const [color,        setColor]        = useState('#f5f0e8');
  const [brushSize,    setBrushSize]    = useState(4);
  const [opacity,      setOpacity]      = useState(100);
  const [isDrawing,    setIsDrawing]    = useState(false);
  const [pos,          setPos]          = useState({x:0,y:0});
  const [mousePos,     setMousePos]     = useState({x:0,y:0});
  const [history,      setHistory]      = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [fillMode,     setFillMode]     = useState(false);
  const [customColor,  setCustomColor]  = useState('#ff4d1c');
  const [textPos,      setTextPos]      = useState(null);
  const [zoom,         setZoom]         = useState(100);

  const getCtx   = () => canvasRef.current?.getContext('2d');
  const getOvCtx = () => overlayRef.current?.getContext('2d');
  const scale    = zoom / 100;

  /* ── Save history ── */
  const saveHistory = useCallback(() => {
    const ctx = getCtx(); if (!ctx) return;
    const data = ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height);
    setHistory(prev => {
      const next = prev.slice(0, historyIndex+1);
      next.push(data);
      if (next.length>40) next.shift();
      return next;
    });
    setHistoryIndex(prev => Math.min(prev+1,39));
  }, [historyIndex]);

  /* ── Init ── */
  useEffect(() => {
    const canvas  = canvasRef.current;
    const overlay = overlayRef.current;
    canvas.width  = overlay.width  = CANVAS_W;
    canvas.height = overlay.height = CANVAS_H;
    const ctx = getCtx();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    saveHistory();
  }, []);

  /* ── Ctrl+Scroll to zoom (on the wrapper viewport) ── */
  useEffect(() => {
    const wrap = wrapperRef.current;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(z => clampZoom(z + (e.deltaY < 0 ? 5 : -5)));
      }
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const h = (e) => {
      if (e.ctrlKey||e.metaKey) {
        if (e.key==='z'){e.preventDefault(); e.shiftKey?redo():undo();}
        if (e.key==='s'){e.preventDefault(); saveImage();}
        if (e.key==='='){e.preventDefault(); setZoom(z=>clampZoom(z+10));}
        if (e.key==='-'){e.preventDefault(); setZoom(z=>clampZoom(z-10));}
        if (e.key==='0'){e.preventDefault(); setZoom(100);}
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [historyIndex, history]);

  /* ── Coord helper: screen → canvas logical px ──
     The canvas element is CSS-scaled. We need to account for:
     1. wrapperRef scroll offset (scrollLeft/scrollTop)
     2. where the canvas sits inside the scrollable area
     3. the CSS scale factor
  */
  const getXY = (e) => {
    const wrap   = wrapperRef.current;
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();   // already in screen px (scaled)
    const client = e.touches ? e.touches[0] : e;
    // screen px relative to canvas top-left, then divide by scale → canvas px
    return {
      x: (client.clientX - rect.left)  / scale,
      y: (client.clientY - rect.top)   / scale,
    };
  };

  /* ── Start ── */
  const startDraw = (e) => {
    const {x,y} = getXY(e);
    const ctx   = getCtx();
    if (tool==='fill')       { saveHistory(); floodFill(ctx,x,y,color); return; }
    if (tool==='eyedropper') {
      const p = ctx.getImageData(Math.max(0,Math.floor(x)),Math.max(0,Math.floor(y)),1,1).data;
      setColor('#'+[p[0],p[1],p[2]].map(v=>v.toString(16).padStart(2,'0')).join(''));
      return;
    }
    if (tool==='text') { setTextPos({x,y}); return; }
    setIsDrawing(true); setPos({x,y});
    if (['pen','brush','spray','eraser'].includes(tool)){ ctx.beginPath(); ctx.moveTo(x,y); }
  };

  /* ── Draw ── */
  const draw = useCallback((e) => {
    const {x,y} = getXY(e);
    setMousePos({x:Math.round(x), y:Math.round(y)});
    if (!isDrawing) return;
    const ctx=getCtx(), ovCtx=getOvCtx();
    ctx.globalAlpha = opacity/100;

    switch (tool) {
      case 'pen':
        ctx.strokeStyle=color; ctx.lineWidth=brushSize; ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.lineTo(x,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y); break;
      case 'brush':
        ctx.strokeStyle=color; ctx.lineWidth=brushSize*3; ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.globalAlpha=(opacity/100)*0.4;
        ctx.lineTo(x,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y); break;
      case 'spray':
        ctx.fillStyle=color;
        for(let i=0;i<30;i++){
          const a=Math.random()*Math.PI*2,r=Math.random()*brushSize*4;
          ctx.globalAlpha=(opacity/100)*Math.random()*0.3;
          ctx.fillRect(x+Math.cos(a)*r, y+Math.sin(a)*r, 1.5,1.5);
        } break;
      case 'eraser':
        ctx.globalAlpha=1; ctx.globalCompositeOperation='destination-out';
        ctx.strokeStyle='rgba(0,0,0,1)'; ctx.lineWidth=brushSize*3; ctx.lineCap='round';
        ctx.lineTo(x,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y);
        ctx.globalCompositeOperation='source-over'; break;
      case 'line':
        ovCtx.clearRect(0,0,CANVAS_W,CANVAS_H);
        ovCtx.strokeStyle=color; ovCtx.lineWidth=brushSize; ovCtx.globalAlpha=opacity/100;
        ovCtx.beginPath(); ovCtx.moveTo(pos.x,pos.y); ovCtx.lineTo(x,y); ovCtx.stroke(); break;
      case 'shape':
        ovCtx.clearRect(0,0,CANVAS_W,CANVAS_H);
        ovCtx.strokeStyle=color; ovCtx.fillStyle=color;
        ovCtx.lineWidth=brushSize; ovCtx.globalAlpha=opacity/100;
        drawShape(ovCtx,pos.x,pos.y,x,y,shape,fillMode); break;
      default: break;
    }
    ctx.globalAlpha=1;
  }, [isDrawing,tool,color,brushSize,opacity,pos,shape,fillMode,scale]);

  /* ── Stop ── */
  const stopDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const ctx=getCtx(), ovCtx=getOvCtx();
    if (['shape','line'].includes(tool)){
      ctx.drawImage(overlayRef.current,0,0);
      ovCtx.clearRect(0,0,CANVAS_W,CANVAS_H);
    }
    ctx.globalCompositeOperation='source-over';
    saveHistory();
  };

  const undo = () => { if(historyIndex<=0) return; const i=historyIndex-1; getCtx().putImageData(history[i],0,0); setHistoryIndex(i); };
  const redo = () => { if(historyIndex>=history.length-1) return; const i=historyIndex+1; getCtx().putImageData(history[i],0,0); setHistoryIndex(i); };
  const clearCanvas = () => { const c=getCtx(); c.fillStyle='#1a1a1a'; c.fillRect(0,0,CANVAS_W,CANVAS_H); saveHistory(); };
  const newCanvas   = () => { clearCanvas(); setHistory([]); setHistoryIndex(-1); };
  const saveImage   = () => { const a=document.createElement('a'); a.href=canvasRef.current.toDataURL('image/png'); a.download=`drawlab-${Date.now()}.png`; a.click(); };

  const zoomIn    = () => setZoom(z=>clampZoom(z+10));
  const zoomOut   = () => setZoom(z=>clampZoom(z-10));
  const zoomReset = () => setZoom(100);
  const zoomFit   = () => {
    const wrap=wrapperRef.current;
    setZoom(Math.floor(Math.min(wrap.offsetWidth/CANVAS_W, wrap.offsetHeight/CANVAS_H)*100));
  };

  /* The canvas element is CSS-transformed.
     Its scaled pixel size determines how much of the scroll area it fills. */
  const scaledW = CANVAS_W * scale;
  const scaledH = CANVAS_H * scale;

  const cursorStyle = {pen:'crosshair',brush:'crosshair',spray:'crosshair',eraser:'cell',fill:'copy',eyedropper:'crosshair',shape:'crosshair',line:'crosshair',text:'text'}[tool]||'default';

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#0d0d0d'}}>

      {/* ── Header ── */}
      <div style={{height:52,background:'#111',borderBottom:'1px solid #2a2a2a',display:'flex',alignItems:'center',padding:'0 16px',gap:12,flexShrink:0}}>
        <div className="header-logo">Draw<span>Lab</span></div>
        <div style={{flex:1}}/>
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={zoomOut}  title="Zoom Out (Ctrl+−)">−</button>
          <span   className="zoom-label" onClick={zoomReset} title="Reset 100%">{zoom}%</span>
          <button className="zoom-btn" onClick={zoomIn}   title="Zoom In (Ctrl+=)">+</button>
          <button className="zoom-btn" onClick={zoomFit}  title="Fit to window" style={{fontSize:11,width:34}}>Fit</button>
        </div>
        <button className="action-btn"         onClick={undo}>↩ Undo</button>
        <button className="action-btn"         onClick={redo}>↪ Redo</button>
        <button className="action-btn danger"  onClick={clearCanvas}>🗑 Clear</button>
        <button className="action-btn"         onClick={newCanvas}>✦ New</button>
        <button className="action-btn primary" onClick={saveImage}>⬇ Save PNG</button>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* ── Left Toolbar ── */}
        <div style={{width:60,background:'#111',borderRight:'1px solid #222',display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 0',gap:4,overflowY:'auto',flexShrink:0}}>
          {TOOLS.map(t=>(
            <button key={t.id} className={`tool-btn ${tool===t.id?'active':''}`} onClick={()=>setTool(t.id)}>
              {t.icon}<span className="tooltip">{t.label}</span>
            </button>
          ))}
          <div className="divider"/>
          <button className={`tool-btn ${fillMode?'active':''}`} onClick={()=>setFillMode(f=>!f)}>
            {fillMode?'■':'□'}<span className="tooltip">{fillMode?'Filled':'Stroke'}</span>
          </button>
        </div>

        {/* ── Right Panel ── */}
        <div style={{width:228,background:'#111',borderRight:'1px solid #222',padding:'14px 12px',display:'flex',flexDirection:'column',gap:12,overflowY:'auto',flexShrink:0}}>
          {/* Color */}
          <div>
            <div className="section-label" style={{marginBottom:8}}>Color</div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:44,height:44,borderRadius:8,background:color,border:'2px solid #444',flexShrink:0,cursor:'pointer'}} onClick={()=>document.getElementById('colorPicker').click()}/>
              <input id="colorPicker" type="color" value={color} onChange={e=>setColor(e.target.value)} style={{position:'absolute',opacity:0,pointerEvents:'none',width:1,height:1}}/>
              <div>
                <div style={{fontSize:11,color:'#888',fontFamily:'Space Mono'}}>{color.toUpperCase()}</div>
                <div style={{fontSize:10,color:'#555',marginTop:2}}>click to pick</div>
              </div>
            </div>
          </div>
          {/* Palette */}
          <div>
            <div className="section-label" style={{marginBottom:8}}>Palette</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {PALETTE.map(c=>(
                <div key={c} className={`color-swatch ${color===c?'selected':''}`}
                     style={{background:c,border:`2px solid ${color===c?'white':'#333'}`}}
                     onClick={()=>setColor(c)}/>
              ))}
              <label style={{width:26,height:26,borderRadius:'50%',cursor:'pointer',border:'2px dashed #555',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#777',flexShrink:0}}>
                +<input type="color" value={customColor} onChange={e=>{setCustomColor(e.target.value);setColor(e.target.value);}} style={{position:'absolute',opacity:0,width:1,height:1}}/>
              </label>
            </div>
          </div>
          <div className="divider"/>
          {/* Size */}
          <div className="slider-wrap">
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><label>Size</label><span style={{fontSize:11,color:'#888'}}>{brushSize}px</span></div>
            <input type="range" min="1" max="60" value={brushSize} onChange={e=>setBrushSize(+e.target.value)}/>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}>
              {[2,6,12,24,40].map(s=>(<div key={s} onClick={()=>setBrushSize(s)} style={{width:Math.max(8,s*0.5+6),height:Math.max(8,s*0.5+6),borderRadius:'50%',background:brushSize===s?'#ff4d1c':'#444',cursor:'pointer',transition:'background 0.15s'}}/>))}
            </div>
          </div>
          {/* Opacity */}
          <div className="slider-wrap">
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><label>Opacity</label><span style={{fontSize:11,color:'#888'}}>{opacity}%</span></div>
            <input type="range" min="5" max="100" value={opacity} onChange={e=>setOpacity(+e.target.value)}/>
          </div>
          {/* Shape picker */}
          {tool==='shape' && (
            <div className="fade-in">
              <div className="divider"/>
              <div className="section-label" style={{marginBottom:8}}>Shapes ({SHAPES.length})</div>
              <div className="shape-grid">
                {SHAPES.map(s=>(
                  <button key={s.id} className={`shape-btn ${shape===s.id?'active':''}`} onClick={()=>setShape(s.id)}>
                    {s.icon}<span className="s-tip">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="divider"/>
          {/* Shortcuts */}
          <div>
            <div className="section-label" style={{marginBottom:8}}>Shortcuts</div>
            {[['Ctrl+Z','Undo'],['Ctrl+Shift+Z','Redo'],['Ctrl+S','Save'],['Ctrl+=','Zoom In'],['Ctrl+−','Zoom Out'],['Ctrl+0','100%'],['Ctrl+Scroll','Zoom']].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span style={{fontSize:10,color:'#555',background:'#1e1e1e',padding:'2px 6px',borderRadius:4}}>{k}</span>
                <span style={{fontSize:10,color:'#666'}}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Viewport (scrollable) ── */}
        <div
          ref={wrapperRef}
          className="canvas-wrapper"
          style={{flex:1, overflow:'auto', position:'relative'}}
        >
          {/*
            The scroll content is sized to the SCALED canvas dimensions.
            This means scrollbars appear when canvas > viewport, and the
            whole thing collapses to nothing when zoomed out — but we need
            at least viewport-size content so you can always draw anywhere.
          */}
          <div style={{
            width:  Math.max(scaledW, '100%'),
            height: Math.max(scaledH, '100%'),
            minWidth:  '100%',
            minHeight: '100%',
            position: 'relative',
          }}>
            {/* Canvas stack, CSS-scaled from top-left */}
            <div style={{
              position:'absolute', top:0, left:0,
              width: scaledW, height: scaledH,
              transformOrigin:'top left',
            }}>
              <canvas
                ref={canvasRef}
                width={CANVAS_W} height={CANVAS_H}
                style={{position:'absolute',top:0,left:0,transform:`scale(${scale})`,transformOrigin:'top left',imageRendering:'pixelated'}}
              />
              <canvas
                ref={overlayRef}
                width={CANVAS_W} height={CANVAS_H}
                style={{position:'absolute',top:0,left:0,transform:`scale(${scale})`,transformOrigin:'top left',pointerEvents:'none',imageRendering:'pixelated'}}
              />
            </div>

            {/* Interaction div — full scaled-canvas size, on top */}
            <div
              style={{position:'absolute',top:0,left:0,width:scaledW,height:scaledH,cursor:cursorStyle,zIndex:10}}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={e=>{e.preventDefault();startDraw(e);}}
              onTouchMove={e=>{e.preventDefault();draw(e);}}
              onTouchEnd={stopDraw}
            />

            {/* Text input */}
            {textPos && (
              <input
                ref={textInputRef} autoFocus placeholder="Type… Enter to stamp"
                style={{
                  position:'absolute',
                  left:textPos.x*scale, top:textPos.y*scale,
                  background:'transparent',border:'none',outline:'none',
                  color, fontSize:`${Math.max(16,brushSize*3)*scale}px`,
                  fontFamily:'Syne,sans-serif',fontWeight:600,
                  caretColor:color,minWidth:120,zIndex:20,
                }}
                onKeyDown={e=>{
                  if(e.key==='Enter'){
                    const ctx=getCtx();
                    ctx.font=`${Math.max(16,brushSize*3)}px Syne,sans-serif`;
                    ctx.fillStyle=color; ctx.globalAlpha=opacity/100;
                    ctx.fillText(e.target.value,textPos.x,textPos.y+Math.max(16,brushSize*3));
                    ctx.globalAlpha=1; setTextPos(null); saveHistory();
                  }
                  if(e.key==='Escape') setTextPos(null);
                }}
              />
            )}
          </div>

          {/* Zoom badge */}
          <div style={{position:'fixed',bottom:36,right:20,background:'rgba(0,0,0,0.6)',border:'1px solid #333',borderRadius:6,padding:'4px 10px',fontSize:11,color:'#888',pointerEvents:'none',backdropFilter:'blur(4px)',zIndex:50}}>
            🔍 {zoom}% &nbsp;·&nbsp; {CANVAS_W}×{CANVAS_H}
          </div>
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div className="status-bar">
        <span><b>Tool:</b> {TOOLS.find(t=>t.id===tool)?.label}</span>
        {tool==='shape'&&<span><b>Shape:</b> {SHAPES.find(s=>s.id===shape)?.label}</span>}
        <span><b>Size:</b> {brushSize}px</span>
        <span><b>Opacity:</b> {opacity}%</span>
        <span><b>Canvas px:</b> {mousePos.x}, {mousePos.y}</span>
        <span><b>Zoom:</b> {zoom}%</span>
        <span style={{marginLeft:'auto'}}><b>Ctrl+Scroll</b> to zoom · <b>Ctrl+0</b> reset · <b>Ctrl+S</b> save</span>
      </div>
    </div>
  );
}

function clampZoom(z) { return Math.min(400, Math.max(25, z)); }

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);