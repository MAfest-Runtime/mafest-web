import { useId, useState, type FormEvent, type RefObject } from "react";
import { QUESTION_MAX } from "../lib/types";
import { Icon } from "./Icon";

/**
 * 질문 입력. 제출하면 부모가 `/search?q=`로 이동시킨다 — 질문이 URL에 남아 링크로 공유된다.
 * 200자 상한은 서버(422)와 같다. 넘게 입력하지 못하게 막고 카운터를 보여준다.
 */
export function SearchBox({
  initial = "",
  inputRef,
  onSubmit,
  autoFocus = false,
  size = "regular",
}: {
  initial?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onSubmit: (question: string) => void;
  autoFocus?: boolean;
  size?: "regular" | "large";
}) {
  const [value, setValue] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  const inputId = useId();
  const counterId = useId();

  // 뒤로가기·칩 클릭으로 URL 질문이 바뀌면 입력창도 따라간다.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setValue(initial);
  }

  const trimmed = value.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form
      role="search"
      className={`searchbox searchbox--${size}`}
      onSubmit={submit}
    >
      <label htmlFor={inputId} className="visually-hidden">
        질문
      </label>
      <span className="searchbox__icon">
        <Icon name="search" size={size === "large" ? 22 : 18} />
      </span>
      <input
        ref={inputRef}
        id={inputId}
        className="searchbox__input"
        type="text"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={QUESTION_MAX}
        placeholder="예: 총보수 0.2% 미만 국내 ETF 순자산 큰 순"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-describedby={counterId}
        // 홈 화면에서만 켠다. 결과 화면에서 켜면 모바일 키보드가 결과를 가린다.
        autoFocus={autoFocus}
      />
      <span id={counterId} className="searchbox__counter">
        <span className="visually-hidden">글자 수 </span>
        {value.length} / {QUESTION_MAX}
      </span>
      <button type="submit" disabled={!trimmed}>
        검색
      </button>
    </form>
  );
}
