import { optimize } from "svgo";

const SVGO_CONFIG = {
  multipass: false,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeViewBox: false
        }
      }
    }
  ]
};

export function optimizeSvg(svgString) {
  const result = optimize(svgString, SVGO_CONFIG);
  return result.data;
}
