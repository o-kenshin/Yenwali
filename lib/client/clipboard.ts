/**
 * テキストをクリップボードにコピーする。
 * Clipboard API が使えない環境（古いブラウザ・http）では、昔ながらの方法で試す。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 下の方法で試す
  }

  try {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const ok = document.execCommand("copy");

    document.body.removeChild(textarea);

    return ok;
  } catch {
    return false;
  }
}

/** LINE で送る画面を開く（テキストに URL を含めると LINE 側でリンクになる） */
export function openLineShare(text: string): void {
  const url = `https://line.me/R/share?text=${encodeURIComponent(text)}`;

  window.open(url, "_blank", "noopener,noreferrer");
}
