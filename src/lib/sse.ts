import { ContractError } from "./validate";

/** ping을 포함해 새 바이트가 이 시간 동안 없으면 연결이 끊긴 것으로 본다. */
export const STREAM_IDLE_TIMEOUT_MS = 30_000;

/** 파서 내부의 유휴 만료 신호. API 계층이 일반 스트림 끊김으로 바꾼다. */
class StreamIdleTimeoutError extends Error {}

/** SSE 한 건. data는 JSON으로 읽은 값이고 이름·구조 검사는 호출한 쪽이 한다. */
export interface RawSseEvent {
  event: string;
  data: unknown;
}

/**
 * `text/event-stream` 본문을 이벤트 단위로 읽는다.
 *
 * - 바이트 청크 경계는 임의이므로 두 가지를 이어 붙인다: 한글 같은 여러 바이트 글자(TextDecoder의
 *   stream 모드)와 줄·이벤트(빈 줄이 오기 전까지 버퍼).
 * - `:`로 시작하는 줄은 주석(`: ping`)이라 버린다.
 * - ping을 포함해 바이트를 하나도 받지 못한 시간이 30초면 유휴 연결로 판단한다. 이벤트가 아니라
 *   바이트를 기준으로 해야, 서버가 보낸 ping도 연결이 살아 있다는 신호로 인정할 수 있다.
 * - 이벤트 끝(빈 줄)을 만나지 못한 채 연결이 끝나면 그 이벤트는 버린다. 끊긴 이벤트를 완성된 것처럼 읽지 않는다.
 * - data가 JSON이 아니면 ContractError(계약 위반)로 끝낸다.
 *
 * 이터레이터를 도중에 닫으면(break·return·throw) 본문 읽기를 취소한다.
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<RawSseEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let pending = "";
  let eventName = "message";
  let dataLines: string[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idleExpired!: Promise<never>;

  /** 비어 있지 않은 바이트 청크를 받을 때만 다시 시작한다. 빈 청크는 연결 활동이 아니다. */
  const armIdleTimer = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleExpired = new Promise<never>((_, reject) => {
      idleTimer = setTimeout(
        () => reject(new StreamIdleTimeoutError()),
        STREAM_IDLE_TIMEOUT_MS,
      );
    });
  };

  /** 줄 하나를 처리한다. 이벤트가 완성되면 돌려준다. */
  const consumeLine = (line: string): RawSseEvent | null => {
    if (line === "") {
      const done = dataLines.length > 0;
      const event = eventName;
      const text = dataLines.join("\n");
      eventName = "message";
      dataLines = [];
      if (!done) return null;
      try {
        return { event, data: JSON.parse(text) };
      } catch {
        throw new ContractError("stream.data");
      }
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
    return null;
  };

  try {
    armIdleTimer();
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), idleExpired]);
      if (done) break;
      if (value.byteLength === 0) continue;
      armIdleTimer();
      pending += decoder.decode(value, { stream: true });
      let start = 0;
      for (;;) {
        const match = /\r\n|\n|\r/.exec(pending.slice(start));
        if (match === null) break;
        // "\r"이 청크 끝이면 다음 청크의 "\n"과 한 줄바꿈일 수 있어 기다린다.
        if (match[0] === "\r" && start + match.index + 1 === pending.length)
          break;
        const line = pending.slice(start, start + match.index);
        start += match.index + match[0].length;
        const event = consumeLine(line);
        if (event !== null) yield event;
      }
      pending = pending.slice(start);
    }
  } finally {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    // 읽기는 즉시 취소하고, 전송 쪽의 정리가 늦어도 확정된 결과는 전달한다.
    void reader.cancel().catch(() => undefined);
  }
}
