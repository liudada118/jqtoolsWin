import React, { useEffect, useState } from "react";

export function useWindowSize() {

  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    prop: calcProp(window.innerWidth),
    size: 'min'
  }));

  function calcProp(width) {
    if (width > 2500) return 1.65;
    const p = width / 1920;
    if (p > 1.2) return 1.2;
    if (p < 0.8) return 0.8;
    return p;
  }

  useEffect(() => {
    const browserResized = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const prop = calcProp(width);
      const size = width > 2500 ? 'max' : 'min'

      // 控制 rem
      document.documentElement.style.fontSize = `${16 * prop}px`;

      // 更新状态
      setSize({ width, height, prop, size });
    };

    browserResized();
    window.addEventListener("resize", browserResized);

    return () => {
      window.removeEventListener("resize", browserResized);
    };


  }, []);

  return size
}

export function useWhyReRender(props) {
  const prev = React.useRef(props);
  React.useEffect(() => {
    const p = prev.current;
    Object.keys({ ...p, ...props }).forEach(k => {
      if (p[k] !== props[k]) {
        // 注意：仅比较引用
        console.log('[rerender] prop changed:', k, p[k], '->', props[k]);
      }
    });
    prev.current = props;
  });
}