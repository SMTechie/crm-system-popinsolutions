import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";

@Injectable()
export class StorageService {
  private client?: S3Client;

  private configuration() {
    const bucket = process.env.STORAGE_BUCKET;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new BadRequestException("External storage requires STORAGE_BUCKET, STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY.");
    }
    return { bucket, accessKeyId, secretAccessKey };
  }

  private s3() {
    const { accessKeyId, secretAccessKey } = this.configuration();
    if (!this.client) {
      this.client = new S3Client({
        region: process.env.STORAGE_REGION || "auto",
        endpoint: process.env.STORAGE_ENDPOINT || undefined,
        forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true" || Boolean(process.env.STORAGE_ENDPOINT),
        credentials: { accessKeyId, secretAccessKey },
      });
    }
    return this.client;
  }

  private keyFor(fileKey: string) {
    const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, "");
    if (publicBase && fileKey.startsWith(`${publicBase}/`)) return fileKey.slice(publicBase.length + 1);
    return fileKey.replace(/^\/uploads\//, "");
  }

  async put(input: { buffer: Buffer; originalName: string; mimeType: string }) {
    const provider = process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === "production" ? "unconfigured" : "local");
    const safeName = input.originalName.replace(/[^a-zA-Z0-9.-]/g, "-");
    const key = `${randomUUID()}-${safeName}`;
    if (provider === "local") {
      const directory = join(process.cwd(), "uploads");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, key), input.buffer, { flag: "wx" });
      return `/uploads/${key}`;
    }
    if (provider !== "s3" && provider !== "r2") {
      throw new BadRequestException(`Storage provider '${provider}' is not supported.`);
    }
    const { bucket } = this.configuration();
    try {
      await this.s3().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }));
    } catch (error) {
      throw new InternalServerErrorException(`Unable to store attachment: ${error instanceof Error ? error.message : "storage error"}`);
    }
    return key;
  }

  async remove(fileKey: string) {
    const provider = process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === "production" ? "unconfigured" : "local");
    const key = this.keyFor(fileKey);
    if (provider === "local") {
      try { await unlink(join(process.cwd(), "uploads", basename(key))); } catch (error: any) {
        if (error?.code !== "ENOENT") throw error;
      }
      return;
    }
    if (provider !== "s3" && provider !== "r2") {
      throw new BadRequestException(`Storage provider '${provider}' is not supported.`);
    }
    const { bucket } = this.configuration();
    try {
      await this.s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      throw new InternalServerErrorException(`Unable to remove attachment: ${error instanceof Error ? error.message : "storage error"}`);
    }
  }

  async read(fileKey: string) {
    const provider = process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === "production" ? "unconfigured" : "local");
    const key = this.keyFor(fileKey);
    if (provider === "local") {
      try { return await readFile(join(process.cwd(), "uploads", basename(key))); }
      catch (error) { throw new BadRequestException(`Unable to read attachment: ${error instanceof Error ? error.message : "file not found"}`); }
    }
    if (provider !== "s3" && provider !== "r2") throw new BadRequestException(`Storage provider '${provider}' is not supported.`);
    const { bucket } = this.configuration();
    try {
      const result = await this.s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error("empty object");
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      throw new BadRequestException(`Unable to read attachment: ${error instanceof Error ? error.message : "file not found"}`);
    }
  }
}
