import { createApplication } from "./app-factory";

async function bootstrap() {
  const app = await createApplication();
  await app.listen(Number(process.env.PORT) || 4000);
}

bootstrap();
