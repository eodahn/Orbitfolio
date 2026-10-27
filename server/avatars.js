import Busboy from "busboy";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { ApiError, requireUser } from "./app.js";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const types = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
export async function validateAvatar(buffer, declaredMime) {
  if (!buffer.length || buffer.length > AVATAR_MAX_BYTES)
    throw new ApiError(413, "A foto deve ter no máximo 5 MB.");
  if (!Object.values(types).includes(declaredMime))
    throw new ApiError(422, "Use PNG, JPG, WebP ou GIF.");
  try {
    const image = sharp(buffer, {
        animated: true,
        limitInputPixels: 20_000_000,
        failOn: "warning",
      }),
      metadata = await image.metadata();
    if (
      types[metadata.format] !== declaredMime ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      (metadata.pageHeight || metadata.height) > 4096 ||
      (metadata.pages || 1) > 200
    )
      throw Error();
    // Decode every frame to reject forged headers/truncated payloads. Store original bytes.
    await image.raw().toBuffer();
    return declaredMime;
  } catch {
    throw new ApiError(
      422,
      "Imagem inválida. Use uma foto de até 4096 px e GIF de até 200 quadros (20 milhões de pixels no total).",
    );
  }
}
export function avatarFraming(input) {
  const result = {
    zoom: Number(input.zoom ?? 1),
    offsetX: Number(input.offsetX ?? 50),
    offsetY: Number(input.offsetY ?? 50),
  };
  if (
    !Object.values(result).every(Number.isFinite) ||
    result.zoom < 1 ||
    result.zoom > 3 ||
    result.offsetX < 0 ||
    result.offsetX > 100 ||
    result.offsetY < 0 ||
    result.offsetY > 100
  )
    throw new ApiError(422, "Enquadramento inválido.");
  return result;
}
export function readAvatarMultipart(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: AVATAR_MAX_BYTES + 1,
          fields: 3,
          fieldSize: 64,
          parts: 5,
        },
      });
    } catch {
      reject(new ApiError(415, "Envie a imagem como multipart/form-data."));
      return;
    }
    let file,
      mime,
      failure,
      total = 0;
    const fields = {};
    const fail = (error) => {
      failure ||= error;
    };
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > AVATAR_MAX_BYTES + 16384) {
        fail(new ApiError(413, "A foto deve ter no máximo 5 MB."));
        req.unpipe(parser);
        parser.destroy();
        req.resume();
        reject(failure);
      }
    });
    req.on("aborted", () => {
      parser.destroy();
      reject(new ApiError(400, "Upload interrompido."));
    });
    parser.on("file", (name, stream, info) => {
      const chunks = [];
      mime = info.mimeType;
      if (name !== "avatar")
        fail(new ApiError(422, "Campo de imagem inválido."));
      stream.on("limit", () =>
        fail(new ApiError(413, "A foto deve ter no máximo 5 MB.")),
      );
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        file = Buffer.concat(chunks);
      });
      stream.on("error", fail);
    });
    parser.on("field", (name, value, info) => {
      if (!["zoom", "offsetX", "offsetY"].includes(name) || info.valueTruncated)
        fail(new ApiError(422, "Enquadramento inválido."));
      else fields[name] = value;
    });
    for (const event of ["partsLimit", "filesLimit", "fieldsLimit"])
      parser.on(event, () =>
        fail(new ApiError(413, "Envie uma única foto de até 5 MB.")),
      );
    parser.on("error", () =>
      reject(failure || new ApiError(400, "Upload inválido.")),
    );
    parser.on("close", () =>
      failure
        ? reject(failure)
        : !file
          ? reject(new ApiError(422, "Escolha uma imagem."))
          : resolve({ file, mime, fields }),
    );
    req.pipe(parser);
  });
}
export async function saveAvatar(db, user, { file, mime, fields }) {
  requireUser(user);
  await validateAvatar(file, mime);
  const frame = avatarFraming(fields),
    version = randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .prepare(
        "INSERT INTO user_avatars(user_id,data,mime_type,size_bytes,version) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,version=excluded.version",
      )
      .run(user.id, file, mime, file.length, version);
    await tx
      .prepare(
        "UPDATE users SET avatar_url=?,avatar_zoom=?,avatar_offset_x=?,avatar_offset_y=? WHERE id=?",
      )
      .run(
        `/api/users/${user.id}/avatar?v=${version}`,
        frame.zoom,
        frame.offsetX,
        frame.offsetY,
        user.id,
      );
  });
}
