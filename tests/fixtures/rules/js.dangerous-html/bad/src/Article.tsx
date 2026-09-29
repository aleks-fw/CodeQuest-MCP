export function Article({ html }: { html: string }) {
  return <article dangerouslySetInnerHTML={{ __html: html }} />;
}
