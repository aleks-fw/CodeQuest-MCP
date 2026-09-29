import DOMPurify from 'dompurify';

export function Article({ html }: { html: string }) {
  return <article dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
