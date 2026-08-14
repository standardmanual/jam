/* @ds-bundle: {"format":4,"namespace":"JAMShopifyDesignSystem_f8de83","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"BadgeFrame","sourcePath":"components/cards/BadgeFrame.jsx"},{"name":"Card","sourcePath":"components/cards/Card.jsx"},{"name":"RarityBadge","sourcePath":"components/cards/RarityBadge.jsx"},{"name":"ShapeTag","sourcePath":"components/cards/ShapeTag.jsx"},{"name":"ModalToast","sourcePath":"components/feedback/ModalToast.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"WanderingEyesLoader","sourcePath":"components/feedback/WanderingEyesLoader.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"TabBar","sourcePath":"components/navigation/TabBar.jsx"},{"name":"TopNav","sourcePath":"components/navigation/TopNav.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"63e5e5f9acd6","components/buttons/IconButton.jsx":"142903a91acf","components/cards/BadgeFrame.jsx":"6680417a03e7","components/cards/Card.jsx":"a7e8219f1404","components/cards/RarityBadge.jsx":"47815e8d7e6e","components/cards/ShapeTag.jsx":"3ae601d3651b","components/feedback/ModalToast.jsx":"a90a886d2126","components/feedback/Toast.jsx":"f1b18e6c2ecf","components/feedback/WanderingEyesLoader.jsx":"eb488d2dadad","components/forms/Input.jsx":"0b61eb8b3914","components/navigation/TabBar.jsx":"d045e86e76cc","components/navigation/TopNav.jsx":"1cab9f8810fa","ui_kits/jam-app/BadgeDetailScreen.jsx":"d647643d4402","ui_kits/jam-app/BadgesScreen.jsx":"5c8157161251","ui_kits/jam-app/DropsScreen.jsx":"50a16e3df62f","ui_kits/jam-app/InventoryScreen.jsx":"0eca6e8e3906","ui_kits/jam-app/ProfileScreen.jsx":"6fec33125e44","ui_kits/jam-app/TodayScreen.jsx":"366d112e5777","ui_kits/jam-app/mockData.js":"c0bfeb81777d"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.JAMShopifyDesignSystem_f8de83 = window.JAMShopifyDesignSystem_f8de83 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
/**
 * Button — primary/outline/ghost pill button.
 * variant: primary (filled purple), outline (bordered), ghost (text-only)
 * surface: light (on white bg) | dark (on --color-bg-inverse bg)
 */
function Button({
  variant = 'primary',
  surface = 'light',
  fullWidth = false,
  disabled = false,
  children,
  onClick,
  type = 'button',
  className = ''
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    fontFamily: 'var(--font-family-base)',
    fontWeight: 400,
    fontSize: 'var(--text-body)',
    lineHeight: 'var(--leading-body)',
    borderRadius: 'var(--radius-pill)',
    padding: '12px 24px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '2px solid transparent',
    transition: 'transform 100ms ease',
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.4 : 1
  };
  const variants = {
    light: {
      primary: {
        background: 'var(--color-primary)',
        color: 'var(--color-text-on-primary)'
      },
      secondary: {
        background: 'var(--color-surface-tint)',
        color: 'var(--color-text)'
      },
      ghost: {
        background: 'transparent',
        color: 'var(--color-primary)',
        padding: '12px 4px'
      }
    },
    dark: {
      primary: {
        background: 'var(--color-white)',
        color: 'var(--color-black)'
      },
      secondary: {
        background: 'rgba(255,255,255,0.16)',
        color: 'var(--color-white)'
      },
      ghost: {
        background: 'transparent',
        color: 'var(--color-white)',
        padding: '12px 4px'
      }
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    onClick: onClick,
    className: className,
    style: {
      ...base,
      ...variants[surface][variant]
    },
    onMouseDown: e => {
      e.currentTarget.style.transform = 'scale(0.96)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
/** IconButton — 44x44 circular icon-only touch target, uses a Lucide CDN icon. */
function IconButton({
  icon = 'chevron-left',
  label = '',
  onClick,
  surface = 'light'
}) {
  const colors = {
    light: 'var(--color-text)',
    dark: 'var(--color-white)'
  };
  return /*#__PURE__*/React.createElement("button", {
    "aria-label": label,
    onClick: onClick,
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-pill)',
      border: 'none',
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: colors[surface]
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `https://unpkg.com/lucide-static@latest/icons/${icon}.svg`,
    alt: "",
    style: {
      width: 22,
      height: 22,
      filter: surface === 'dark' ? 'invert(1)' : 'none'
    }
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/cards/BadgeFrame.jsx
try { (() => {
const {
  useId
} = React;
/**
 * BadgeFrame — clips a badge image into one of 7 decorative frame shapes.
 * shape: 'circle' | 'ticket-v' | 'ticket-h' | 'scallop' | 'corner-cut' | 'tab-notch' | 'dumbbell'
 * Pass the badge image / icon as children.
 */
function makePath(shape, w, h) {
  switch (shape) {
    case 'ticket-v':
      {
        const r = Math.min(w * 0.07, 13);
        const cx = w / 2;
        return `M0,0 L${cx - r},0 A${r},${r} 0 0,0 ${cx + r},0 L${w},0 V${h} L${cx + r},${h} A${r},${r} 0 0,0 ${cx - r},${h} L0,${h} Z`;
      }
    case 'ticket-h':
      {
        const r = Math.min(h * 0.07, 13);
        const cy = h / 2;
        return `M0,0 L${w},0 V${cy - r} A${r},${r} 0 0,0 ${w},${cy + r} V${h} L0,${h} V${cy + r} A${r},${r} 0 0,0 0,${cy - r} Z`;
      }
    case 'scallop':
      {
        const sx = w / 3,
          sy = h / 3;
        const r = Math.min(sx, sy) * 0.78;
        return [`M0,0`, `A${r},${r} 0 0,0 ${sx},0`, `A${r},${r} 0 0,0 ${sx * 2},0`, `A${r},${r} 0 0,0 ${w},0`, `A${r},${r} 0 0,0 ${w},${sy}`, `A${r},${r} 0 0,0 ${w},${sy * 2}`, `A${r},${r} 0 0,0 ${w},${h}`, `A${r},${r} 0 0,0 ${sx * 2},${h}`, `A${r},${r} 0 0,0 ${sx},${h}`, `A${r},${r} 0 0,0 0,${h}`, `A${r},${r} 0 0,0 0,${sy * 2}`, `A${r},${r} 0 0,0 0,${sy}`, `A${r},${r} 0 0,0 0,0`, 'Z'].join(' ');
      }
    case 'corner-cut':
      {
        const oy = h * 0.42,
          dr = h * 0.9;
        const bump = dr - Math.sqrt(dr * dr - oy * oy);
        const xl = bump,
          xr = w - bump;
        return `M${xl},0 L${xr},0 V${h / 2 - oy} A${dr},${dr} 0 0,1 ${xr},${h / 2 + oy} V${h} L${xl},${h} V${h / 2 + oy} A${dr},${dr} 0 0,1 ${xl},${h / 2 - oy} Z`;
      }
    case 'tab-notch':
      {
        const n = Math.min(w, h) * 0.1,
          nr = n / 2;
        return `M${n},0 L${w - n},0 L${w - n},${n - nr} A${nr},${nr} 0 0,1 ${w - n + nr},${n} L${w},${n} L${w},${h - n} L${w - n + nr},${h - n} A${nr},${nr} 0 0,1 ${w - n},${h - n + nr} L${w - n},${h} L${n},${h} L${n},${h - n + nr} A${nr},${nr} 0 0,1 ${n - nr},${h - n} L0,${h - n} L0,${n} L${n - nr},${n} A${nr},${nr} 0 0,1 ${n},${n - nr} Z`;
      }
    case 'dumbbell':
      {
        const oy = h * 0.42;
        const dr = h * 0.9;
        return `M0,0 L${w},0 V${h / 2 - oy} A${dr},${dr} 0 0,0 ${w},${h / 2 + oy} V${h} L0,${h} V${h / 2 + oy} A${dr},${dr} 0 0,0 0,${h / 2 - oy} Z`;
      }
    default:
      return null;
  }
}
function BadgeFrame({
  shape = 'circle',
  width = 200,
  height = 200,
  color = 'var(--color-primary)',
  children,
  style = {}
}) {
  const isCircle = shape === 'circle';
  const pathD = isCircle ? null : makePath(shape, width, height);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      flexShrink: 0,
      background: color,
      borderRadius: isCircle ? '50%' : undefined,
      clipPath: pathD ? `path('${pathD}')` : undefined,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { BadgeFrame });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/BadgeFrame.jsx", error: String((e && e.message) || e) }); }

// components/cards/Card.jsx
try { (() => {
/** Card — surface container. tone: white (default) | tint (soft purple tint) | inverse (black) */
function Card({
  tone = 'white',
  padding = 24,
  radius = 'var(--radius-card)',
  children,
  className = '',
  style = {},
  onClick
}) {
  const backgrounds = {
    white: {
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)'
    },
    tint: {
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)'
    },
    inverse: {
      background: 'var(--color-bg-inverse)',
      color: 'var(--color-black)',
      border: 'none'
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    onClick: onClick,
    style: {
      borderRadius: radius,
      padding,
      ...backgrounds[tone],
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/Card.jsx", error: String((e && e.message) || e) }); }

// components/cards/RarityBadge.jsx
try { (() => {
/**
 * RarityBadge — badge rarity pill. common/rare/legend/mythic use a fixed 4-color
 * state palette (not decorative) so users keep the color language they've learned.
 */
const config = {
  common: {
    label: 'Common',
    bg: 'var(--color-rarity-common)'
  },
  rare: {
    label: 'Rare',
    bg: 'var(--color-rarity-rare)'
  },
  legend: {
    label: 'Legend',
    bg: 'var(--color-rarity-legend)'
  },
  mythic: {
    label: 'Mythic',
    bg: 'var(--color-rarity-mythic)'
  }
};
function RarityBadge({
  rarity = 'common',
  className = ''
}) {
  const c = config[rarity] ?? config.common;
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 14px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 12,
      lineHeight: 1,
      fontWeight: 700,
      textTransform: 'uppercase',
      color: '#fff',
      background: c.bg
    }
  }, c.label);
}
Object.assign(__ds_scope, { RarityBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/RarityBadge.jsx", error: String((e && e.message) || e) }); }

// components/cards/ShapeTag.jsx
try { (() => {
const SHAPES = {
  rect: {
    clipPath: 'none',
    borderRadius: 'var(--radius-input)'
  },
  pill: {
    clipPath: 'none',
    borderRadius: 'var(--radius-pill)'
  },
  circle: {
    clipPath: 'none',
    borderRadius: '50%'
  },
  dome: {
    clipPath: 'none',
    borderRadius: '50% 50% 0 0'
  },
  triangle: {
    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
    borderRadius: 0
  },
  flag: {
    clipPath: 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)',
    borderRadius: 0
  },
  hex: {
    clipPath: 'polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0% 50%)',
    borderRadius: 0
  }
};
const TAG_COLORS = ['var(--color-tag-1)', 'var(--color-tag-2)', 'var(--color-tag-3)', 'var(--color-tag-4)', 'var(--color-tag-5)', 'var(--color-tag-6)', 'var(--color-tag-7)', 'var(--color-tag-8)'];

/**
 * ShapeTag — a colored shape container. Two uses:
 *  1) text label chip (category tag, like Shop app's tag cloud)
 *  2) badge/thumbnail box — pass an icon/image as children instead of a label
 * `colorIndex` cycles through the tag palette; pass an explicit `color` to override.
 */
function ShapeTag({
  shape = 'rect',
  colorIndex = 0,
  color,
  dark = false,
  children,
  style = {},
  className = ''
}) {
  const s = SHAPES[shape] ?? SHAPES.rect;
  const bg = color ?? TAG_COLORS[colorIndex % TAG_COLORS.length];
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: bg,
      color: dark ? '#fff' : '#111',
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      textAlign: 'center',
      lineHeight: 1.15,
      padding: shape === 'triangle' ? '18px 10px 6px' : shape === 'flag' || shape === 'hex' ? '10px 20px' : '10px 16px',
      minHeight: 44,
      boxSizing: 'border-box',
      ...s,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { ShapeTag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/ShapeTag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ModalToast.jsx
try { (() => {
/** ModalToast — centered modal variant of Toast (backdrop + centered card), for emphasis moments (badge earned, mission complete) vs the bottom-anchored Toast for passive status. */
function ModalToast({
  message,
  type = 'success',
  open = true,
  onDismiss
}) {
  if (!open) return null;
  const icons = {
    success: 'check',
    error: 'x',
    info: 'info'
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onDismiss,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 60
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--color-surface-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      padding: 32,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      width: 240,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'var(--color-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `https://unpkg.com/lucide-static@latest/icons/${icons[type]}.svg`,
    alt: "",
    style: {
      width: 26,
      height: 26
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 16,
      color: 'var(--color-text)'
    }
  }, message)));
}
Object.assign(__ds_scope, { ModalToast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ModalToast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const {
  useEffect,
  useState
} = React;
/** Toast — bottom-anchored transient message. type: success | error | info */
function Toast({
  message,
  type = 'info',
  open = true,
  onDismiss
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(open), 10);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;
  const icons = {
    success: 'check',
    error: 'x',
    info: 'info'
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onDismiss,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 20px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-bg-inverse)',
      color: 'var(--color-black)',
      fontSize: 14,
      boxShadow: 'inset 0 0 0 1px var(--color-border)',
      transform: visible ? 'translateY(0)' : 'translateY(8px)',
      opacity: visible ? 1 : 0,
      transition: 'all 200ms ease',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `https://unpkg.com/lucide-static@latest/icons/${icons[type]}.svg`,
    alt: "",
    style: {
      width: 16,
      height: 16,
      filter: 'invert(1)'
    }
  }), /*#__PURE__*/React.createElement("span", null, message));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/WanderingEyesLoader.jsx
try { (() => {
const {
  useMemo
} = React;
/**
 * WanderingEyesLoader — 눈 안에서 눈동자가 돌아다니다가 주기적으로 깜빡이는 대기 표시.
 * 소스: jam-web/src/components/ui/WanderingEyesLoader.tsx (1:1 재현)
 *
 * 이동 경로는 마운트마다 새로 랜덤 생성 — 매번 다르게 움직인다.
 * 두 눈은 같은 경로를 공유해 "같은 곳을 보는" 느낌을 유지한다.
 */
const STATIC_CSS = `.wandering-eyes{display:flex;align-items:center;justify-content:center;gap:12px}.wandering-eyes-eye{position:relative;width:48px;height:48px;border-radius:9999px;background-color:var(--eye-color,#f8fafc);overflow:hidden;flex-shrink:0;animation:wandering-eyes-blink var(--duration,2s) ease-in-out infinite}.wandering-eyes-eye:nth-child(2){animation-delay:-60ms}.wandering-eyes-pupil{position:absolute;inset:0;margin:auto;width:68%;height:68%;border-radius:9999px;background-color:var(--pupil-color,#0f172a);animation:wandering-eyes-move var(--duration,2s) ease-in-out infinite}@keyframes wandering-eyes-blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(0.06)}97%{transform:scaleY(1)}}@media(prefers-reduced-motion:reduce){.wandering-eyes-eye,.wandering-eyes-pupil{animation:none}}`;

// 눈동자 이동 키프레임의 중간 정지 지점(%) — 깜빡임 키프레임과 리듬을 맞춘 값 (소스 동일)
const MOVE_STOPS = [15, 30, 45, 60, 75, 88];
function randomOffset(maxPercent) {
  const angle = Math.random() * Math.PI * 2;
  const radius = maxPercent * (0.55 + Math.random() * 0.45);
  return {
    x: Math.round(Math.cos(angle) * radius * 100) / 100,
    y: Math.round(Math.sin(angle) * radius * 100) / 100
  };
}
let _uid = 0;
function WanderingEyesLoader({
  duration = '2s',
  eyeColor = '#f8fafc',
  pupilColor = '#0f172a',
  style = {}
}) {
  const animName = useMemo(() => `wem-${++_uid}`, []);
  const keyframesCss = useMemo(() => {
    const start = randomOffset(34);
    const stops = MOVE_STOPS.map(stop => ({
      stop,
      ...randomOffset(38)
    }));
    const body = stops.map(({
      stop,
      x,
      y
    }) => `${stop}%{transform:translate(${x}%,${y}%)}`).join(' ');
    return `@keyframes ${animName}{0%,100%{transform:translate(${start.x}%,${start.y}%)} ${body}}`;
  }, [animName]);
  return /*#__PURE__*/React.createElement("div", {
    className: "wandering-eyes",
    style: {
      '--duration': duration,
      '--eye-color': eyeColor,
      '--pupil-color': pupilColor,
      ...style
    },
    role: "status",
    "aria-label": "\uB85C\uB529 \uC911"
  }, /*#__PURE__*/React.createElement("style", null, STATIC_CSS + keyframesCss), /*#__PURE__*/React.createElement("span", {
    className: "wandering-eyes-eye"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wandering-eyes-pupil",
    style: {
      animationName: animName
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "wandering-eyes-eye"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wandering-eyes-pupil",
    style: {
      animationName: animName
    }
  })));
}
Object.assign(__ds_scope, { WanderingEyesLoader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/WanderingEyesLoader.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
/** Input — text field, subtle grey border, moderate 8px radius (kept subdued next to the fully-pill buttons). */
function Input({
  placeholder = '',
  value,
  onChange,
  type = 'text'
}) {
  return /*#__PURE__*/React.createElement("input", {
    type: type,
    placeholder: placeholder,
    value: value,
    onChange: onChange,
    style: {
      width: '100%',
      height: 44,
      borderRadius: 'var(--radius-input)',
      border: '1px solid var(--color-border)',
      padding: '0 20px',
      fontSize: 16,
      fontFamily: 'var(--font-family-base)',
      color: 'var(--color-text)',
      background: 'var(--color-white)',
      boxSizing: 'border-box'
    }
  });
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TabBar.jsx
try { (() => {
/**
 * TabBar — floating pill bottom nav, icon-only, recreated 1:1 from the JAM!
 * codebase's own TabBar (jam-web/src/components/ui/TabBar.tsx): filled icon +
 * small active-dot when selected, outline icon at reduced opacity when not.
 * Colors adapted to this system's light surface (white capsule, purple active).
 */
const icons = {
  today: {
    fill: /*#__PURE__*/React.createElement("path", {
      d: "M3.00098 11.8284C3.00098 11.2979 3.21169 10.7892 3.58676 10.4142L10.5868 3.41416C11.3678 2.63311 12.6341 2.63311 13.4152 3.41416L20.4152 10.4142C20.7903 10.7892 21.001 11.2979 21.001 11.8284V20C21.001 20.5522 20.5533 21 20.001 21H15.001C14.4487 21 14.001 20.5522 14.001 20V16C14.001 15.4477 13.5533 15 13.001 15H11.001C10.4487 15 10.001 15.4477 10.001 16V20C10.001 20.5522 9.55326 21 9.00098 21H4.00098C3.44869 21 3.00098 20.5522 3.00098 20V11.8284Z",
      fill: "currentColor"
    }),
    line: /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M3 11.8284C3 11.2979 3.21071 10.7892 3.58579 10.4142L10.5858 3.41416C11.3668 2.63311 12.6332 2.63311 13.4142 3.41416L20.4142 10.4142C20.7893 10.7892 21 11.2979 21 11.8284V20C21 20.5522 20.5523 21 20 21H14C13.4477 21 13 20.5522 13 20V15H11V20C11 20.5522 10.5523 21 10 21H4C3.44772 21 3 20.5522 3 20V11.8284ZM4.64645 11.4748C4.55268 11.5686 4.5 11.6958 4.5 11.8284V19.5H9.5V14.4999C9.5 13.9477 9.94772 13.4999 10.5 13.4999H13.5C14.0523 13.4999 14.5 13.9477 14.5 14.4999V19.5H19.5V11.8284C19.5 11.6958 19.4473 11.5686 19.3536 11.4748L12.3536 4.47481C12.1583 4.27955 11.8417 4.27955 11.6464 4.47482L4.64645 11.4748Z",
      fill: "currentColor"
    })
  },
  badges: {
    fill: /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M20.0006 6.22251C20.619 6.57985 21 7.23993 21 7.95424V16.0457C21 16.76 20.619 17.4201 20.0006 17.7774L13.0006 21.8219C12.3815 22.1796 11.6185 22.1796 10.9994 21.8219L3.99944 17.7774C3.38095 17.4201 3 16.76 3 16.0457V7.95424C3 7.23993 3.38096 6.57985 3.99945 6.2225L10.9994 2.17806C11.6185 1.82037 12.3815 1.82037 13.0006 2.17806L20.0006 6.22251ZM15.5 12C15.5 13.933 13.933 15.5 12 15.5C10.067 15.5 8.5 13.933 8.5 12C8.5 10.067 10.067 8.49996 12 8.49996C13.933 8.49996 15.5 10.067 15.5 12Z",
      fill: "currentColor"
    }),
    line: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79082 9.79086 7.99996 12 7.99996C14.2091 7.99996 16 9.79082 16 12ZM14.5 12C14.5 13.3807 13.3807 14.5 12 14.5C10.6193 14.5 9.5 13.3807 9.5 12C9.5 10.6193 10.6193 9.49996 12 9.49996C13.3807 9.49996 14.5 10.6193 14.5 12Z",
      fill: "currentColor"
    }), /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M13.0006 2.17806C12.3815 1.82037 11.6185 1.82037 10.9994 2.17806L3.99945 6.22251C3.38096 6.57986 3 7.23993 3 7.95424V16.0457C3 16.76 3.38095 17.4201 3.99944 17.7774L10.9994 21.8219C11.6185 22.1796 12.3815 22.1796 13.0006 21.8219L20.0006 17.7774C20.619 17.4201 21 16.76 21 16.0457V7.95424C21 7.23993 20.619 6.57986 20.0006 6.22251L13.0006 2.17806ZM19.2501 7.5213L12.2501 3.47686C12.0954 3.38743 11.9046 3.38743 11.7499 3.47686L4.74986 7.5213C4.59524 7.61064 4.5 7.77566 4.5 7.95424V16.0457C4.5 16.2243 4.59524 16.3893 4.74986 16.4786L11.7499 20.5231C11.9046 20.6125 12.0954 20.6125 12.2501 20.5231L19.2501 16.4786C19.4048 16.3893 19.5 16.2243 19.5 16.0457V7.95424C19.5 7.77566 19.4048 7.61064 19.2501 7.5213Z",
      fill: "currentColor"
    }))
  },
  drops: {
    fill: /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M21 10C21 15.428 14.6665 21.6012 12.6256 23.4496C12.2667 23.7746 11.7333 23.7746 11.3744 23.4496C9.33352 21.6012 3 15.428 3 10C3 5.02944 7.02944 1 12 1C16.9706 1 21 5.02944 21 10ZM15.25 10C15.25 11.7949 13.7949 13.25 12 13.25C10.2051 13.25 8.75 11.7949 8.75 10C8.75 8.20508 10.2051 6.75 12 6.75C13.7949 6.75 15.25 8.20508 15.25 10Z",
      fill: "currentColor"
    }),
    line: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M12 14C14.2091 14 16 12.2091 16 10C16 7.79086 14.2091 6 12 6C9.79086 6 8 7.79086 8 10C8 12.2091 9.79086 14 12 14ZM12 12.5C13.3807 12.5 14.5 11.3807 14.5 10C14.5 8.61929 13.3807 7.5 12 7.5C10.6193 7.5 9.5 8.61929 9.5 10C9.5 11.3807 10.6193 12.5 12 12.5Z",
      fill: "currentColor"
    }), /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M21 10C21 14.963 15.7052 20.549 13.238 22.8825C12.5344 23.5479 11.4656 23.5479 10.762 22.8825C8.29483 20.549 3 14.963 3 10C3 5.02944 7.02944 1 12 1C16.9706 1 21 5.02944 21 10ZM19.5 10C19.5 12.003 18.4035 14.3207 16.8194 16.5614C15.2676 18.7563 13.4056 20.6593 12.2072 21.7927C12.1369 21.8592 12.0638 21.8816 12 21.8816C11.9363 21.8816 11.8631 21.8592 11.7928 21.7927C10.5944 20.6593 8.73237 18.7563 7.18064 16.5614C5.59649 14.3207 4.5 12.003 4.5 10C4.5 5.85787 7.85787 2.5 12 2.5C16.1421 2.5 19.5 5.85787 19.5 10Z",
      fill: "currentColor"
    }))
  },
  missions: {
    fill: /*#__PURE__*/React.createElement("path", {
      d: "M13.0931 1.26966C13.3758 0.873844 14 1.07386 14 1.56028V10H19.0284C19.4351 10 19.6716 10.4597 19.4353 10.7907L10.9069 22.7304C10.6241 23.1262 9.99999 22.9262 9.99999 22.4398V14H4.97158C4.5649 14 4.32834 13.5404 4.56472 13.2094L13.0931 1.26966Z",
      fill: "currentColor"
    }),
    line: /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M10.3932 22.8633C10.0998 23.2367 9.50002 23.0292 9.50002 22.5544V14H4.52876C4.11155 14 3.87784 13.5192 4.1356 13.1911L13.6069 1.13678C13.9002 0.7634 14.5 0.970847 14.5 1.44569V10H19.4713C19.8885 10 20.1222 10.4809 19.8644 10.8089L10.3932 22.8633ZM11 13.5C11 12.9478 10.5523 12.5 10 12.5H6.58622L13 4.33701V10.5C13 11.0523 13.4477 11.5 14 11.5H17.4138L11 19.6631V13.5Z",
      fill: "currentColor"
    })
  },
  inventory: {
    fill: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5.42416 4.00772C5.78025 3.38457 6.44293 3 7.16065 3H16.8394C17.5571 3 18.2198 3.38457 18.5758 4.00772L21.7365 9.53885C21.8198 9.68457 21.884 9.83955 21.9282 10H16.5C15.9477 10 15.5144 10.4568 15.359 10.9868C14.9329 12.4393 13.5903 13.5 12 13.5C10.4097 13.5 9.06707 12.4393 8.64104 10.9868C8.4856 10.4568 8.05229 10 7.5 10H2.07181C2.11601 9.83955 2.18025 9.68457 2.26351 9.53885L5.42416 4.00772Z",
      fill: "currentColor"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 15C14.2407 15 16.1336 13.5273 16.7707 11.5H22V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V11.5H7.22932C7.86636 13.5273 9.7593 15 12 15Z",
      fill: "currentColor"
    })),
    line: /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M2.26351 9.53885C2.09083 9.84105 2 10.1831 2 10.5311V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V10.5311C22 10.1831 21.9092 9.84105 21.7365 9.53885L18.5758 4.00772C18.2198 3.38457 17.5571 3 16.8394 3H7.16065C6.44293 3 5.78025 3.38457 5.42416 4.00772L2.26351 9.53885ZM17.2735 4.75193C17.1845 4.59614 17.0188 4.5 16.8394 4.5H7.16065C6.98122 4.5 6.81555 4.59614 6.72652 4.75193L3.72763 10H7.5C8.05229 10 8.4856 10.4568 8.64104 10.9868C9.06707 12.4393 10.4097 13.5 12 13.5C13.5903 13.5 14.9329 12.4393 15.359 10.9868C15.5144 10.4568 15.9477 10 16.5 10H20.2724L17.2735 4.75193ZM20.5 11.5H16.7707C16.1336 13.5273 14.2407 15 12 15C9.7593 15 7.86636 13.5273 7.22932 11.5H3.5V18C3.5 18.2761 3.72386 18.5 4 18.5H20C20.2761 18.5 20.5 18.2761 20.5 18V11.5Z",
      fill: "currentColor"
    })
  },
  profile: {
    fill: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z",
      fill: "currentColor"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M19.5815 16.479C19.8642 16.8074 20 17.2333 20 17.6666V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V17.6666C4 17.2333 4.13576 16.8074 4.41847 16.479C6.25235 14.3488 8.96866 13 12 13C15.0313 13 17.7477 14.3488 19.5815 16.479Z",
      fill: "currentColor"
    })),
    line: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7ZM14.5 7C14.5 8.38071 13.3807 9.5 12 9.5C10.6193 9.5 9.5 8.38071 9.5 7C9.5 5.61929 10.6193 4.5 12 4.5C13.3807 4.5 14.5 5.61929 14.5 7Z",
      fill: "currentColor"
    }), /*#__PURE__*/React.createElement("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M20 17.1666C20 16.7333 19.8642 16.3074 19.5815 15.979C17.7477 13.8488 15.0313 12.5 12 12.5C8.96866 12.5 6.25235 13.8488 4.41847 15.979C4.13576 16.3074 4 16.7333 4 17.1666V19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V17.1666ZM18 19.5C18.2761 19.5 18.5 19.2761 18.5 19V17.1666C18.5 17.0384 18.4601 16.9754 18.4448 16.9576C16.8837 15.1443 14.5763 14 12 14C9.4237 14 7.11631 15.1443 5.55524 16.9576C5.53991 16.9754 5.5 17.0384 5.5 17.1666V19C5.5 19.2761 5.72386 19.5 6 19.5H18Z",
      fill: "currentColor"
    }))
  }
};
const tabs = [{
  key: 'today',
  label: '투데이'
}, {
  key: 'badges',
  label: '배지'
}, {
  key: 'drops',
  label: '드랍'
}, {
  key: 'missions',
  label: '미션'
}, {
  key: 'inventory',
  label: '인벤토리'
}, {
  key: 'profile',
  label: '프로필'
}];

/** TabBar — floating pill bottom navigation, recreated 1:1 from the JAM! codebase's TabBar.tsx (icon-only, active dot, fill/line icon swap). */
function TabBar({
  active = 'today',
  onChange
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: 16,
      width: 'calc(100% - 32px)',
      maxWidth: 398,
      height: 64,
      borderRadius: 'var(--radius-pill)',
      background: '#ffffff',
      boxShadow: 'inset 0 0 0 1px var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 4px',
      zIndex: 40
    }
  }, tabs.map(t => {
    const active_ = t.key === active;
    const ic = icons[t.key];
    return /*#__PURE__*/React.createElement("button", {
      key: t.key,
      "aria-label": t.label,
      "aria-current": active_ ? 'page' : undefined,
      onClick: () => onChange && onChange(t.key),
      style: {
        position: 'relative',
        flex: 1,
        height: '100%',
        border: 'none',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: active_ ? 'var(--color-primary)' : 'rgba(0,0,0,0.35)'
      }
    }, /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      width: 24,
      height: 24
    }, active_ ? ic.fill : ic.line)), /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: 'var(--color-primary)',
        opacity: active_ ? 1 : 0,
        transition: 'opacity 150ms ease'
      }
    }));
  }));
}
Object.assign(__ds_scope, { TabBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TabBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNav.jsx
try { (() => {
/** TopNav — sticky top bar with back chevron, title, optional right slot. */
function TopNav({
  title = '',
  showBack = true,
  onBack,
  rightSlot = null
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      background: 'var(--color-bg)',
      zIndex: 30,
      borderBottom: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '0 12px',
      height: 56
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, showBack && /*#__PURE__*/React.createElement("button", {
    "aria-label": "\uB4A4\uB85C",
    onClick: onBack,
    style: {
      width: 44,
      height: 44,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/chevron-left.svg",
    alt: "",
    style: {
      width: 22,
      height: 22
    }
  })), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'var(--text-body)',
      lineHeight: 'var(--leading-body)',
      fontWeight: 400,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 44,
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, rightSlot)));
}
Object.assign(__ds_scope, { TopNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/jam-app/BadgeDetailScreen.jsx
try { (() => {
function BadgeDetailScreen({
  badge,
  onBack
}) {
  const {
    TopNav,
    Card,
    RarityBadge,
    Button
  } = window.JAMShopifyDesignSystem_f8de83;
  if (!badge) return null;
  const shapeIndex = badge.id % window.mockData.badgeShapes.length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--color-primary)'
    }
  }, /*#__PURE__*/React.createElement(TopNav, {
    title: "\uBC30\uC9C0 \uC0C1\uC138",
    onBack: onBack
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 16px 96px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(ShapeTag, {
    shape: shapeByRarity[badge.rarity],
    colorIndex: colorByRarity[badge.rarity],
    style: {
      width: 120,
      height: 120
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/medal.svg",
    style: {
      width: 44,
      height: 44
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 8px',
      fontSize: 'var(--text-h3)',
      fontWeight: 400,
      color: 'var(--color-white)'
    }
  }, badge.name), /*#__PURE__*/React.createElement(RarityBadge, {
    rarity: badge.rarity
  }))), /*#__PURE__*/React.createElement(Card, {
    tone: "white"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.6
    }
  }, badge.date, "\uC5D0 \uD68D\uB4DD\uD588\uC5B4\uC694. \uC774 \uBC30\uC9C0\uB294 \uBAA9\uD45C \uAC70\uB9AC\uB97C \uC644\uC8FC\uD55C \uB7EC\uB108\uC5D0\uAC8C \uC8FC\uC5B4\uC838\uC694.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Card, {
    tone: "white",
    style: {
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-h4)'
    }
  }, "1,204"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0 0',
      fontSize: 11,
      color: 'var(--color-text-secondary)'
    }
  }, "\uB204\uC801 \uD68D\uB4DD\uC790")), /*#__PURE__*/React.createElement(Card, {
    tone: "white",
    style: {
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-h4)'
    }
  }, "300"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0 0',
      fontSize: 11,
      color: 'var(--color-text-secondary)'
    }
  }, "JAM \uD3EC\uC778\uD2B8"))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 12px',
      fontSize: 'var(--text-h4)',
      fontWeight: 400,
      color: 'var(--color-white)'
    }
  }, "\uD68D\uB4DD \uC870\uAC74"), /*#__PURE__*/React.createElement(Card, {
    tone: "white",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/target.svg",
    style: {
      width: 20,
      height: 20,
      opacity: 0.6
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14
    }
  }, "\uB204\uC801 42.195km \uC644\uC8FC\uD558\uAE30"))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    surface: "dark",
    fullWidth: true
  }, "\uC774 \uBC30\uC9C0 \uACF5\uC720\uD558\uAE30")));
}
window.BadgeDetailScreen = BadgeDetailScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/jam-app/BadgeDetailScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/jam-app/BadgesScreen.jsx
try { (() => {
function BadgesScreen({
  onBack,
  onOpenDetail
}) {
  const {
    TopNav,
    Card,
    RarityBadge
  } = window.JAMShopifyDesignSystem_f8de83;
  const {
    badges
  } = window.mockData;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--color-bg)'
    }
  }, /*#__PURE__*/React.createElement(TopNav, {
    title: "\uBC30\uC9C0",
    onBack: onBack
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 16px 96px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, badges.map((b, i) => /*#__PURE__*/React.createElement(Card, {
    key: b.id,
    tone: "white",
    onClick: () => onOpenDetail && onOpenDetail(b),
    style: {
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 72,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(window.BadgeShapeBox, {
    index: i
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 4px',
      fontSize: 14
    }
  }, b.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(RarityBadge, {
    rarity: b.rarity
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--color-text-secondary)'
    }
  }, b.date))))));
}
window.BadgesScreen = BadgesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/jam-app/BadgesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/jam-app/DropsScreen.jsx
try { (() => {
function DropsScreen({
  onBack
}) {
  const {
    TopNav,
    Card,
    RarityBadge,
    Button
  } = window.JAMShopifyDesignSystem_f8de83;
  const {
    drops
  } = window.mockData;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--color-bg)'
    }
  }, /*#__PURE__*/React.createElement(TopNav, {
    title: "\uB4DC\uB78D",
    onBack: onBack
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 16px 96px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: 'var(--color-text-secondary)'
    }
  }, "\uADFC\uCC98\uC5D0 \uC544\uC774\uD15C\uC774 \uB5A8\uC5B4\uC84C\uC5B4\uC694"), drops.map(d => /*#__PURE__*/React.createElement(Card, {
    key: d.id,
    tone: "white",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-card)',
      background: 'var(--color-surface-tint)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/package.svg",
    style: {
      width: 20,
      height: 20
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14
    }
  }, d.name), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 11,
      color: 'var(--color-text-secondary)'
    }
  }, d.distance)), /*#__PURE__*/React.createElement(RarityBadge, {
    rarity: d.rarity
  }))), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true
  }, "\uC9C0\uAE08 \uB4DC\uB78D\uD560\uAE4C\uC694?")));
}
window.DropsScreen = DropsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/jam-app/DropsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/jam-app/InventoryScreen.jsx
try { (() => {
function InventoryScreen({
  onBack
}) {
  const {
    TopNav,
    Card,
    RarityBadge
  } = window.JAMShopifyDesignSystem_f8de83;
  const {
    inventory
  } = window.mockData;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--color-bg)'
    }
  }, /*#__PURE__*/React.createElement(TopNav, {
    title: "\uC778\uBCA4\uD1A0\uB9AC",
    onBack: onBack
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px',
      fontSize: 12,
      color: 'var(--color-text-secondary)'
    }
  }, inventory.length, " / 50\uAC1C \uBCF4\uAD00 \uC911"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 12
    }
  }, inventory.map((it, i) => /*#__PURE__*/React.createElement(Card, {
    key: it.id,
    tone: "white",
    padding: 12
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: '1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(window.BadgeShapeBox, {
    index: i,
    size: 48,
    iconSize: 18
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0',
      fontSize: 11,
      textAlign: 'center',
      lineHeight: 1.3
    }
  }, it.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(RarityBadge, {
    rarity: it.rarity
  })))))));
}
window.InventoryScreen = InventoryScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/jam-app/InventoryScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/jam-app/ProfileScreen.jsx
try { (() => {
function ProfileScreen() {
  const {
    Card,
    Button
  } = window.JAMShopifyDesignSystem_f8de83;
  const {
    badges
  } = window.mockData;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 16px 96px',
      background: 'var(--color-bg)',
      minHeight: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      background: 'var(--color-surface-tint)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/user.svg",
    style: {
      width: 28,
      height: 28,
      opacity: 0.5
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'var(--text-h3)',
      fontWeight: 400
    }
  }, "\uC2DC\uD604"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 13,
      color: 'var(--color-text-secondary)'
    }
  }, "@sihyun_run"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 24,
      margin: '24px 0'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-h4)'
    }
  }, "128"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: 'var(--color-text-secondary)'
    }
  }, "\uBC30\uC9C0")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-h4)'
    }
  }, "3,240"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: 'var(--color-text-secondary)'
    }
  }, "JAM \uD3EC\uC778\uD2B8")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-h4)'
    }
  }, "52"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: 'var(--color-text-secondary)'
    }
  }, "\uD314\uB85C\uC6CC"))), /*#__PURE__*/React.createElement(Card, {
    tone: "tint",
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/activity.svg",
    style: {
      width: 18,
      height: 18
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, "Strava \uC5F0\uB3D9\uB428"))), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 16px',
      fontSize: 'var(--text-h4)',
      fontWeight: 400
    }
  }, "\uB300\uD45C \uBC30\uC9C0"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr',
      gap: 8,
      marginBottom: 24
    }
  }, badges.map(b => /*#__PURE__*/React.createElement("div", {
    key: b.id,
    style: {
      aspectRatio: '1',
      borderRadius: 'var(--radius-card)',
      background: '#fff',
      border: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/medal.svg",
    style: {
      width: 22,
      height: 22,
      opacity: 0.5
    }
  })))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true
  }, "\uD504\uB85C\uD544 \uD3B8\uC9D1"));
}
window.ProfileScreen = ProfileScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/jam-app/ProfileScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/jam-app/TodayScreen.jsx
try { (() => {
function BadgeShapeBox({
  index,
  size = 56,
  iconSize = 22
}) {
  const {
    badgeShapes
  } = window.mockData;
  const shapeId = badgeShapes[index % badgeShapes.length];
  const colors = ['var(--color-tag-1)', 'var(--color-tag-2)', 'var(--color-tag-3)', 'var(--color-tag-4)', 'var(--color-tag-5)', 'var(--color-tag-6)', 'var(--color-tag-7)', 'var(--color-tag-8)'];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      aspectRatio: '1',
      background: colors[index % colors.length],
      clipPath: `url(#${shapeId})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/medal.svg",
    style: {
      width: iconSize,
      height: iconSize
    }
  }));
}
window.BadgeShapeBox = BadgeShapeBox;
function TodayScreen({
  onOpenBadge
}) {
  const {
    Card,
    RarityBadge
  } = window.JAMShopifyDesignSystem_f8de83;
  const {
    badges,
    shortcuts
  } = window.mockData;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 16px 96px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      background: 'var(--color-bg)',
      minHeight: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo/jam-logo-black.png",
    alt: "JAM!",
    style: {
      height: 24
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 4px',
      fontSize: 14,
      color: 'var(--color-text-secondary)'
    }
  }, "\uC624\uB298\uB3C4 \uC88B\uC740 \uD558\uB8E8\uC608\uC694"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'var(--text-h2)',
      fontWeight: 400
    }
  }, "\uC2DC\uD604\uB2D8")), /*#__PURE__*/React.createElement(Card, {
    tone: "tint"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://unpkg.com/lucide-static@latest/icons/activity.svg",
    style: {
      width: 18,
      height: 18
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, "Strava \uC5F0\uB3D9\uB428")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--color-text-secondary)'
    }
  }, "8\uC6D4 13\uC77C 09:12"))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 'var(--text-h4)',
      fontWeight: 400
    }
  }, "\uCD5C\uADFC \uD68D\uB4DD \uBC30\uC9C0"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--color-primary)'
    }
  }, "\uC804\uCCB4\uBCF4\uAE30 >")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, badges.slice(0, 2).map((b, i) => /*#__PURE__*/React.createElement(Card, {
    key: b.id,
    tone: "white",
    onClick: () => onOpenBadge && onOpenBadge(b),
    style: {
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 72,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(window.BadgeShapeBox, {
    index: i
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 4px',
      fontSize: 14
    }
  }, b.name), /*#__PURE__*/React.createElement(RarityBadge, {
    rarity: b.rarity
  }))))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 16px',
      fontSize: 'var(--text-h4)',
      fontWeight: 400
    }
  }, "\uBC14\uB85C\uAC00\uAE30"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, shortcuts.map(s => /*#__PURE__*/React.createElement(Card, {
    key: s.title,
    tone: "white"
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 16,
      fontWeight: 700
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0 0',
      fontSize: 11,
      color: 'var(--color-text-secondary)'
    }
  }, s.body))))));
}
window.TodayScreen = TodayScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/jam-app/TodayScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/jam-app/mockData.js
try { (() => {
window.mockData = {
  badges: [{
    id: 1,
    name: '서울 마라톤 완주',
    rarity: 'common',
    date: '7월 28일'
  }, {
    id: 2,
    name: '한강 5km 러너',
    rarity: 'rare',
    date: '7월 25일'
  }, {
    id: 3,
    name: '산악 정복자',
    rarity: 'legend',
    date: '7월 20일'
  }, {
    id: 4,
    name: '전설의 첫 완주',
    rarity: 'mythic',
    date: '7월 12일'
  }],
  drops: [{
    id: 1,
    name: '한강공원 근처 아이템',
    distance: '320m',
    rarity: 'rare'
  }, {
    id: 2,
    name: '남산 정상 아이템',
    distance: '1.2km',
    rarity: 'legend'
  }, {
    id: 3,
    name: '올림픽공원 아이템',
    distance: '540m',
    rarity: 'common'
  }],
  inventory: [{
    id: 1,
    name: '러너의 손목밴드',
    rarity: 'common'
  }, {
    id: 2,
    name: '한강의 조각',
    rarity: 'rare'
  }, {
    id: 3,
    name: '산악인의 지도',
    rarity: 'legend'
  }, {
    id: 4,
    name: '새벽 러너의 부적',
    rarity: 'mythic'
  }, {
    id: 5,
    name: '완주 메달 조각',
    rarity: 'common'
  }, {
    id: 6,
    name: '여름 러닝 티켓',
    rarity: 'rare'
  }],
  shortcuts: [{
    title: '이번 주 미션',
    body: '3개 진행 중'
  }, {
    title: '인벤토리',
    body: '6개 아이템 보관 중'
  }, {
    title: '드랍',
    body: '근처에 3개'
  }, {
    title: '아이템 조합',
    body: '2개 조합 가능'
  }],
  badgeShapes: ['badge-circle', 'badge-pinch', 'badge-notch', 'badge-scallop', 'badge-corner', 'badge-tabs', 'badge-capsule']
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/jam-app/mockData.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.BadgeFrame = __ds_scope.BadgeFrame;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.RarityBadge = __ds_scope.RarityBadge;

__ds_ns.ShapeTag = __ds_scope.ShapeTag;

__ds_ns.ModalToast = __ds_scope.ModalToast;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.WanderingEyesLoader = __ds_scope.WanderingEyesLoader;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.TabBar = __ds_scope.TabBar;

__ds_ns.TopNav = __ds_scope.TopNav;

})();
