"use client"

import dynamic from "next/dynamic"

const P5Animation = dynamic(() => import("@/components/p5-animation"), {
  ssr: false,
})

export default function Home() {
  return (
    <main className="relative">
      <P5Animation />
    </main>
  )
}
