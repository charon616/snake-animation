"use client"

import dynamic from "next/dynamic"

const P5Animation = dynamic(() => import("@/components/p5-animation"), {
  ssr: false,
})

export default function Home() {
  // 画像パスの配列（public フォルダ内の画像を指定）

  return (
    <main className="relative">
      <P5Animation />
    </main>
  )
}
