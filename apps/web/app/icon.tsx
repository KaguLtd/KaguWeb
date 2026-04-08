import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3d2914 0%, #855d33 100%)",
          color: "#fff6ec",
          fontSize: 240,
          fontWeight: 700,
          fontFamily: "serif"
        }}
      >
        K
      </div>
    ),
    size
  );
}

