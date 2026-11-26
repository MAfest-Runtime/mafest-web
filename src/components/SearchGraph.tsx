import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useMappingFocus } from "../lib/citeFocus";
import {
  describeGraph,
  ENTITY_LABEL,
  graphNarrowing,
  SLOT_LABEL,
  setCountText,
} from "../lib/explain";
import { formatCount, productHref } from "../lib/format";
import {
  COMPACT_FONT,
  layoutGraph,
  type PlacedEdge,
  type PlacedNode,
} from "../lib/graphLayout";
import type { Interpretation } from "../lib/types";
import { TABLE_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { Icon } from "./Icon";

/** 층 하나가 나타나는 간격(ms). 층 7개면 2초 안쪽에서 끝난다. */
const STEP_MS = 240;
/** 같은 층 상품끼리 엇갈려 나타나는 간격(ms). */
const STAGGER_MS = 40;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** 선 긋기 애니메이션을 쓸 간선. 점선(속성·수집 안 함·장애·모호)과 하위 클래스는 흐려지며 나타난다. */
function drawable(e: PlacedEdge): boolean {
  const state = e.edge.state;
  return (
    e.edge.kind !== "property" &&
    e.edge.kind !== "subclass" &&
    state !== "absent" &&
    state !== "blocked" &&
    state !== "ambiguous"
  );
}

/**
 * 탐색 그래프(r8 `interpretation.graph`). 질문이 온톨로지 클래스에 닿고 → 속성 조건을
 * 지나며 상품 집합이 줄고 → 실제 상품(·관계 개체)에 이르는 경로를 노드-간선으로 그린다.
 *
 * - 넓은 화면은 왼쪽→오른쪽, 좁은 화면은 위→아래로 배치한다(graphLayout.ts).
 * - 간선의 번호 배지는 해석 과정 번호와 같다. 어느 쪽이든 올리면 양쪽이 함께 강조된다.
 * - 상품 노드는 링크다. 넓은 화면은 오른쪽 패널, 좁은 화면은 상세 페이지로 간다.
 * - 그림을 못 보는 경우를 위해 같은 내용을 문장 목록으로 둔다(visually-hidden).
 * - 화면에 처음 들어올 때 층 순서대로 나타난다(클래스 → 집합 → 상품, 선은 앞에서 뒤로 그어짐).
 *   한 번만 재생하고 "다시 보기"로 다시 튼다. 동작 줄이기 설정이나 IntersectionObserver가
 *   없는 환경에서는 바로 다 보인다. CSS 애니메이션(투명도·위치·선 긋기)만 쓴다.
 */
export function SearchGraph({
  interpretation: it,
  onOpen,
}: {
  interpretation: Interpretation;
  onOpen: (domain: string, productId: string) => void;
}) {
  const graph = it.graph;
  const wide = useMediaQuery(TABLE_QUERY);
  const { active, setActive } = useMappingFocus();
  const uid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);

  // 넓은 화면은 가로 배치를 먼저 해 보고, 72%까지 줄여도 칸을 넘으면 세로로 바꾼다.
  // 가로 스크롤 없이 늘 한눈에 보이게 한다.
  const { layout, scale } = useMemo(() => {
    const vertical = () =>
      layoutGraph(graph, "vertical", Math.max(280, width ?? 340));
    if (!wide) return { layout: vertical(), scale: 1 };
    const horizontal = layoutGraph(graph, "horizontal");
    if (width === null || horizontal.width <= width)
      return { layout: horizontal, scale: 1 };
    const fit = width / horizontal.width;
    return fit >= 0.72
      ? { layout: horizontal, scale: fit }
      : { layout: vertical(), scale: 1 };
  }, [graph, wide, width]);
  const vertical = layout.orientation === "vertical";
  const narrowing = useMemo(
    () => graphNarrowing(graph, it.domains),
    [graph, it.domains],
  );
  const description = useMemo(() => describeGraph(graph), [graph]);

  // 등장 애니메이션: 0 = 아직 화면 밖(대기), 1 이상 = 재생 회차(다시 보기마다 +1).
  const reduced = useMediaQuery(REDUCED_MOTION);
  const canAnimate = !reduced && typeof IntersectionObserver !== "undefined";
  const [play, setPlay] = useState(0);
  const hasNodes = graph.nodes.length > 0;
  useEffect(() => {
    const el = box.current;
    if (!canAnimate || play > 0 || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPlay(1);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canAnimate, play, hasNodes]);
  const anim = !canAnimate ? undefined : play === 0 ? "waiting" : "playing";

  // 노드별 등장 시각(ms). 층 순서, 같은 층 상품은 조금씩 엇갈린다.
  const timing = useMemo(() => {
    const at = new Map<string, number>();
    const seen = new Map<number, number>();
    for (const p of layout.nodes) {
      const k = seen.get(p.layer) ?? 0;
      seen.set(p.layer, k + 1);
      at.set(
        p.node.id,
        p.layer * STEP_MS + (p.node.kind === "product" ? k * STAGGER_MS : 0),
      );
    }
    return at;
  }, [layout]);
  const nodeDelay = (id: string) => timing.get(id) ?? 0;
  const edgeTiming = (e: PlacedEdge) => {
    const a = nodeDelay(e.edge.from);
    const b = nodeDelay(e.edge.to);
    const start = Math.min(a, b);
    return { start, length: Math.max(160, Math.abs(b - a)) };
  };
  const delayStyle = (ms: number, length?: number) =>
    ({
      "--d": `${Math.round(ms)}ms`,
      ...(length !== undefined ? { "--len": `${Math.round(length)}ms` } : {}),
    }) as CSSProperties;

  if (graph.nodes.length === 0) return null;

  // 같은 출발점에서 같은 번호가 여러 간선에 붙으면 배지는 하나만 그린다.
  const badged = new Set<string>();
  const labeled = new Set<string>();
  const badgeOf = (e: PlacedEdge): number | null => {
    const m = e.edge.mapping;
    if (m === null || m >= it.mappings.length) return null;
    const key = `${e.edge.from}:${m}`;
    if (badged.has(key)) return null;
    badged.add(key);
    return m;
  };

  const hover = (mapping: number | null) => ({
    onMouseEnter: mapping === null ? undefined : () => setActive(mapping),
    onMouseLeave: mapping === null ? undefined : () => setActive(null),
  });
  const lit = (mapping: number | null) =>
    active !== null && mapping === active ? true : undefined;

  const openProduct = (node: PlacedNode["node"]) => (event: MouseEvent) => {
    if (!node.domain || !node.product_id) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    onOpen(node.domain, node.product_id);
  };

  const marker = (kind: string) => `url(#${uid}-${kind})`;
  const descId = `${uid}-desc`;

  return (
    <section className="graph card" aria-labelledby={`${uid}-title`}>
      <header className="graph__head">
        <h2 id={`${uid}-title`} className="graph__title">
          탐색 그래프
        </h2>
        {narrowing.length > 0 && (
          <ul className="graph__narrow" aria-label="좁혀진 건수">
            {narrowing.map((n) => (
              <li key={n.domain} className={`narrow narrow--${n.tone}`}>
                <span className="narrow__name">{n.label}</span>
                {n.from !== null && (
                  <>
                    <span className="num">{formatCount(n.from)}</span>
                    <span aria-hidden="true">→</span>
                    <span className="visually-hidden">에서</span>
                  </>
                )}
                <strong className="num">{n.to}</strong>
              </li>
            ))}
          </ul>
        )}
      </header>

      <div
        ref={box}
        className={`graph__canvas graph__canvas--${vertical ? "v" : "h"}`}
        data-focusing={active !== null || undefined}
        data-anim={anim}
      >
        <svg
          key={play}
          className="graph__svg"
          width={layout.width * scale}
          height={layout.height * scale}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="group"
          aria-label="탐색 그래프 그림"
          aria-describedby={descId}
        >
          <defs>
            <Arrow id={`${uid}-arrow`} className="gm gm--default" />
            <Arrow id={`${uid}-relation`} className="gm gm--relation" />
            <Arrow id={`${uid}-danger`} className="gm gm--danger" />
            <Arrow id={`${uid}-subclass`} className="gm gm--subclass" hollow />
          </defs>

          <g className="gedges">
            {layout.edges.map((e) => {
              const k = e.edge.kind;
              const m =
                k === "subclass"
                  ? marker("subclass")
                  : e.edge.state === "blocked" || e.edge.state === "empty"
                    ? marker("danger")
                    : k === "relation"
                      ? marker("relation")
                      : marker("arrow");
              const draw = drawable(e);
              const t = edgeTiming(e);
              return (
                <g
                  key={`${e.edge.from}-${e.edge.to}`}
                  className="ganim ganim--edge"
                  style={delayStyle(t.start)}
                >
                  <path
                    d={e.path}
                    className={`gedge gedge--${k} gstate--${e.edge.state ?? "ok"}${draw ? " gedge--draw" : ""}`}
                    pathLength={draw ? 1 : undefined}
                    style={draw ? delayStyle(t.start, t.length) : undefined}
                    data-active={lit(e.edge.mapping)}
                    // 하위 클래스는 UML처럼 빈 삼각형이 상위 클래스(경로 시작 쪽)를 가리킨다.
                    markerStart={k === "subclass" ? m : undefined}
                    markerEnd={draw || k === "subclass" ? undefined : m}
                    {...hover(e.edge.mapping)}
                  />
                  {draw && (
                    // 선이 다 그어진 뒤에 화살촉이 붙도록 화살촉만 따로 그린다.
                    <g
                      className="ganim ganim--edge"
                      style={delayStyle(t.start + t.length - 60)}
                    >
                      <path
                        d={e.path}
                        className="gedge gedge--tip"
                        data-active={lit(e.edge.mapping)}
                        markerEnd={m}
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          <g className="gnodes">
            {layout.nodes.map((p) => (
              <g
                key={p.node.id}
                className="ganim"
                style={delayStyle(nodeDelay(p.node.id))}
              >
                <GraphNodeView
                  placed={p}
                  active={lit(p.node.mapping)}
                  hover={hover(p.node.mapping)}
                  onClick={openProduct(p.node)}
                  compact={vertical}
                />
              </g>
            ))}
          </g>

          <g className="glabels">
            {layout.edges.map((e) => {
              const badge = badgeOf(e);
              // 같은 출발점의 같은 이름 간선(예: creditGrade ×3)은 이름을 한 번만 쓴다.
              const labelKey = `${e.edge.from}:${e.edge.label}`;
              const label =
                e.edge.label && !labeled.has(labelKey) ? e.edge.label : null;
              if (label) labeled.add(labelKey);
              if (badge === null && !label && !e.edge.weight) return null;
              const slot = badge !== null ? it.mappings[badge].slot : null;
              const text = [label, e.edge.weight].filter(Boolean).join(" ");
              return (
                <g
                  key={`l-${e.edge.from}-${e.edge.to}`}
                  className="ganim"
                  style={delayStyle(
                    Math.max(nodeDelay(e.edge.from), nodeDelay(e.edge.to)),
                  )}
                >
                  <g
                    className="glabel"
                    data-active={lit(e.edge.mapping)}
                    {...hover(e.edge.mapping)}
                  >
                    {text && (
                      <text
                        className={`gedge-label gedge-label--${e.edge.kind}`}
                        x={e.mid.x}
                        y={e.mid.y + (badge !== null ? -14 : -6)}
                        textAnchor="middle"
                      >
                        {text}
                      </text>
                    )}
                    {badge !== null && slot && (
                      <g
                        className={`gbadge slot--${slot}`}
                        transform={`translate(${e.mid.x},${e.mid.y})`}
                      >
                        <title>{`${badge + 1}. ${SLOT_LABEL[slot]} · ${it.mappings[badge].result}`}</title>
                        <circle r={9} />
                        <text y={4} textAnchor="middle">
                          {badge + 1}
                        </text>
                      </g>
                    )}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <ol id={descId} className="visually-hidden" aria-label="그래프 설명">
        {description.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>

      <div className="graph__foot">
        <ul className="graph__legend" aria-hidden="true">
          <li>
            <span className="lg lg--concept" />
            클래스
          </li>
          <li>
            <span className="lg lg--individual" />
            개체
          </li>
          <li>
            <span className="lg lg--set" />
            상품 집합
          </li>
          <li>
            <span className="lg lg--product" />
            상품 <span className="lg-star">★</span> 답변 인용
          </li>
          {graph.nodes.some((n) => n.kind === "entity") && (
            <li>
              <span className="lg lg--entity" />
              관계 개체
            </li>
          )}
          <li>
            <span className="lg-line lg-line--constraint" />
            조건으로 좁힘
          </li>
          <li>
            <span className="lg-line lg-line--property" />
            속성
          </li>
        </ul>
        {anim && (
          <button
            type="button"
            className="graph__replay"
            onClick={() => setPlay((n) => n + 1)}
          >
            <Icon name="refresh" size={14} />
            다시 보기
          </button>
        )}
      </div>
    </section>
  );
}

function Arrow({
  id,
  className,
  hollow,
}: {
  id: string;
  className: string;
  hollow?: boolean;
}) {
  return (
    <marker
      id={id}
      className={className}
      viewBox="0 0 10 10"
      refX={hollow ? 9 : 8}
      refY={5}
      markerUnits="userSpaceOnUse"
      markerWidth={hollow ? 12 : 9}
      markerHeight={hollow ? 12 : 9}
      orient="auto-start-reverse"
    >
      <path d="M0,0 L10,5 L0,10 z" />
    </marker>
  );
}

function GraphNodeView({
  placed,
  active,
  hover,
  onClick,
  compact,
}: {
  placed: PlacedNode;
  compact: boolean;
  active: true | undefined;
  hover: {
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
  };
  onClick: (event: MouseEvent) => void;
}) {
  const { node, x, y, w, h, lines } = placed;
  const cx = x + w / 2;
  const labelSize = compact ? COMPACT_FONT : 12;
  const state = node.state ?? "ok";
  const common = {
    className: `gnode gnode--${node.kind} gstate--${state}${node.cited ? " gnode--cited" : ""}`,
    "data-active": active,
    ...hover,
  };

  switch (node.kind) {
    case "concept":
      return (
        <g {...common}>
          <title>{node.iri ? `${node.label} (${node.iri})` : node.label}</title>
          <rect x={x} y={y} width={w} height={h} rx={10} />
          <text x={cx} y={y + h / 2 + 4} textAnchor="middle">
            {node.label}
          </text>
        </g>
      );
    case "individual":
      return (
        <g {...common}>
          <title>{node.iri ? `${node.label} (${node.iri})` : node.label}</title>
          <rect x={x} y={y} width={w} height={h} rx={h / 2} />
          <text x={cx} y={y + h / 2 + 4} textAnchor="middle">
            {node.label}
          </text>
        </g>
      );
    case "set":
      return (
        <g {...common}>
          <title>{`${node.label} ${setCountText(node)}`}</title>
          <rect x={x} y={y} width={w} height={h} rx={8} />
          {lines.map((line, i) => (
            <text
              key={i}
              className="gnode__label"
              x={cx}
              y={y + 19 + i * (labelSize + 3)}
              textAnchor="middle"
              fontSize={labelSize}
            >
              {line}
            </text>
          ))}
          <text
            className="gnode__count"
            x={cx}
            y={y + h - 11}
            textAnchor="middle"
          >
            {setCountText(node)}
          </text>
        </g>
      );
    case "product": {
      const label = lines[0];
      const href =
        node.domain && node.product_id
          ? productHref(node.domain, node.product_id)
          : undefined;
      return (
        <a
          {...common}
          href={href}
          onClick={onClick}
          aria-label={`${node.label}${node.cited ? " (답변 인용)" : ""} 상세`}
        >
          <title>{node.label}</title>
          <rect x={x} y={y} width={w} height={h} rx={h / 2} />
          <text x={cx} y={y + h / 2 + 4} textAnchor="middle">
            {node.cited && <tspan className="gnode__star">★ </tspan>}
            {label}
          </text>
        </a>
      );
    }
    case "entity":
      return (
        <g {...common}>
          <title>{node.label}</title>
          <rect x={x} y={y} width={w} height={h} rx={6} />
          {node.entity_type && (
            <text className="gnode__type" x={cx} y={y + 16} textAnchor="middle">
              {ENTITY_LABEL[node.entity_type]}
            </text>
          )}
          <text
            x={cx}
            y={y + (node.entity_type ? 34 : h / 2 + 4)}
            textAnchor="middle"
          >
            {node.label}
          </text>
        </g>
      );
  }
}

/** 요소의 안쪽 폭. ResizeObserver가 없는 환경(jsdom)에서는 null. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
