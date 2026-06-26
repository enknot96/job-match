import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { embedText } from "@/lib/embed";
import { mutationForbiddenResponse } from "@/lib/guard";

const DUMMY = [
  // --- フロント強い × AWS認定あり（両取り＝上位本命） ---
  {
    name: "佐藤 美咲",
    resume:
      "フロントエンドエンジニアとして5年。React・TypeScriptで大規模SPAを設計・実装。AWS認定ソリューションアーキテクト アソシエイトを保有し、フロントのCI/CDをAWS上で構築した。",
  },
  {
    name: "山口 彩花",
    resume:
      "フロントエンドエンジニア5年。React・TypeScriptでSaaSのUIを担当。AWS認定ソリューションアーキテクト アソシエイトを保有。",
  },
  {
    name: "松本 大和",
    resume:
      "Webエンジニア6年。Next.jsとTypeScriptでフロントを開発し、AWS認定デベロッパー アソシエイトを保有。サーバーレス構成の経験あり。",
  },
  {
    name: "上田 海斗",
    resume:
      "フルスタックエンジニア6年。フロントはReactとTypeScript、バックはNode.jsで開発。AWS認定デベロッパーを保有。",
  },
  {
    name: "伊藤 彩",
    resume:
      "モバイルアプリ開発4年。React NativeとTypeScriptでiOS/Androidアプリを開発。AWS認定デベロッパー アソシエイトを保有。Lambdaなどサーバーレスの経験もある。",
  },

  // --- フロント強い × AWS認定なし（意味検索は強いがキーワードで落ちる） ---
  {
    name: "田中 健太",
    resume:
      "Web開発7年。Next.js・TypeScript・GraphQLでBtoB SaaSのフロントエンドをリード。状態管理やパフォーマンス最適化が得意。クラウドはEC2やS3を業務利用してきた。",
  },
  {
    name: "中村 葵",
    resume:
      "フロントエンドエンジニア6年。ReactとReduxで大規模なtoC向けWebサービスを開発。JavaScriptとTypeScriptに精通している。",
  },
  {
    name: "小林 駿",
    resume:
      "フロントエンド開発5年。ReactとTypeScript、Three.jsで3D表現のあるWebアプリを構築。パフォーマンスチューニングが得意。",
  },
  {
    name: "加藤 莉子",
    resume:
      "フロントエンドエンジニア4年。React・Next.jsでアクセシビリティに配慮したUIを実装。TypeScriptの経験が豊富。",
  },
  {
    name: "斎藤 健",
    resume:
      "フロントエンドエンジニア5年。ReactとTypeScriptでデザインシステムとコンポーネントライブラリを構築。Storybookを活用している。",
  },

  // --- バックエンド/インフラ × AWS認定あり（意味検索では埋もれるがキーワードで救済） ---
  {
    name: "鈴木 大輔",
    resume:
      "バックエンド/インフラエンジニア8年。GoとKubernetesでマイクロサービスを運用。AWS認定ソリューションアーキテクト プロフェッショナルを保有。フロントエンド開発の経験は少ない。",
  },
  {
    name: "清水 翔太",
    resume:
      "バックエンドエンジニア7年。JavaとSpringでAPIを開発し、AWS認定ソリューションアーキテクトを保有。インフラ構築も担当する。",
  },
  {
    name: "森 健一",
    resume:
      "SRE/インフラエンジニア9年。TerraformとAWSで基盤を構築・運用。AWS認定ソリューションアーキテクト プロフェッショナルを保有。",
  },
  {
    name: "池田 直樹",
    resume:
      "バックエンドエンジニア5年。PythonとDjangoでWeb APIを開発。AWS認定デベロッパーを保有し、ECSでの運用経験がある。",
  },
  {
    name: "武田 凛",
    resume:
      "ネットワークエンジニア8年。社内インフラとネットワークを設計・運用。AWS認定ソリューションアーキテクトを保有。プログラミングは限定的。",
  },

  // --- 別系統のフロント（Vue/Angular。Reactではないが意味は近め） ---
  {
    name: "高橋 由紀",
    resume:
      "フロントエンドエンジニア4年。Vue.jsとTypeScriptで管理画面を多数開発。UIコンポーネント設計が得意。AWSの利用経験はない。",
  },
  {
    name: "橋本 七海",
    resume:
      "フロントエンドエンジニア4年。AngularとTypeScriptで業務系SPAを開発。型安全な設計を重視している。",
  },
  {
    name: "石川 涼",
    resume:
      "フロントエンド開発3年。VueとNuxtでコーポレートサイトやWebアプリを制作。HTML/CSSにも強い。",
  },
  {
    name: "藤井 颯",
    resume:
      "Webエンジニア6年。Ruby on Railsでスタートアップのプロダクトを開発。フロントは少しReactも触る。",
  },

  // --- ノイズ（意味もキーワードも遠い） ---
  {
    name: "渡辺 翔",
    resume:
      "データサイエンティスト3年。Pythonで機械学習モデルの構築と分析を担当。pandasやscikit-learnを使用。Webアプリ開発の経験はない。",
  },
  {
    name: "山本 拓",
    resume:
      "業務系SEとして10年。JavaとSpring BootでエンタープライズのバックエンドAPIを開発。オンプレミス中心でクラウド経験は浅い。",
  },
  {
    name: "岡田 真央",
    resume:
      "データエンジニア5年。SQLとPythonでETLパイプラインを構築。BigQueryやEmbulkを使用。フロント開発の経験はない。",
  },
  {
    name: "藤田 健太郎",
    resume:
      "iOSエンジニア6年。SwiftでネイティブアプリをUIKitとSwiftUIで開発。Web開発の経験は少ない。",
  },
  {
    name: "後藤 美優",
    resume: "Androidエンジニア5年。Kotlinでネイティブアプリを開発。Jetpack Composeを使用している。",
  },
  {
    name: "村上 拓海",
    resume:
      "UI/UXデザイナー7年。Figmaでデザインシステムを構築。簡単なHTML/CSSは書けるがプログラミングは専門外。",
  },
  {
    name: "近藤 さくら",
    resume:
      "ITプロジェクトマネージャー8年。Web/アプリ開発の進行管理とチームマネジメントを担当。自身はコードを書かない。",
  },
  {
    name: "福田 蓮",
    resume: "QAエンジニア5年。テスト自動化をCypressとSeleniumで実施。JavaScriptの基礎知識がある。",
  },
  {
    name: "西村 陽菜",
    resume:
      "データサイエンティスト4年。Rと統計解析でマーケティング分析を担当。機械学習モデルも構築する。",
  },
  {
    name: "太田 大和",
    resume:
      "組み込みエンジニア9年。C/C++でマイコン制御のファームウェアを開発。Web技術の経験はない。",
  },
  {
    name: "三浦 結衣",
    resume: "バックエンドエンジニア5年。PHPとLaravelでECサイトを開発・運用。MySQLの設計が得意。",
  },
];

// 開発用: 何度叩いてもOKなように全消し→再投入（本番では無効化）
export async function POST() {
  const forbidden = mutationForbiddenResponse();
  if (forbidden) return forbidden;

  try {
    await db.execute("DELETE FROM candidates");
    for (const c of DUMMY) {
      const vec = await embedText(c.resume);
      await db.execute("INSERT INTO candidates (name, resume, embedding) VALUES (?, ?, ?)", [
        c.name,
        c.resume,
        `[${vec.join(",")}]`,
      ]);
    }
    return NextResponse.json({ inserted: DUMMY.length });
  } catch (e) {
    console.error("[/api/seed] failed:", e);
    return NextResponse.json({ error: "シードに失敗しました。" }, { status: 500 });
  }
}
