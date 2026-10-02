import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 云托管/容器部署（国内备用镜像）需要 standalone 产物；不影响本地 dev/start
  output: "standalone",
};

export default nextConfig;
