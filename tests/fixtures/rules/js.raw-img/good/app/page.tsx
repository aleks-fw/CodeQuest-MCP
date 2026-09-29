import Image from 'next/image';

export default function Page() {
  return (
    <main>
      <Image src="/hero.jpg" alt="Our product" width={1200} height={600} />
    </main>
  );
}
