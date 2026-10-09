// Valida la infraestructura de AWS (infra/) SIN credenciales y SIN tocar AWS: `terraform fmt -check`, `terraform init -backend=false` y
// `terraform validate`. Usa el Terraform instalado si hay uno; si no, la imagen oficial `hashicorp/terraform` por docker.
// No existe `plan` ni `apply` aquí (docs/INFRA-AWS.md): el despliegue real lo hace una persona con credenciales.
//
//   npm run infra:validar

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const VERSION_IMAGEN = "1.9.8";

function hay(comando: string): boolean {
  return spawnSync(comando, ["version"], { stdio: "ignore" }).status === 0;
}

/** Ejecuta `terraform <args>` en infra/ y devuelve el código de salida. Sin credenciales de AWS en el entorno. */
function terraform(args: string[]): number {
  const limpio = { ...process.env };
  for (const k of Object.keys(limpio)) if (k.startsWith("AWS_")) delete limpio[k];
  limpio["TF_IN_AUTOMATION"] = "1";
  if (hay("terraform")) return spawnSync("terraform", [`-chdir=${RAIZ}/infra`, ...args], { stdio: "inherit", env: limpio }).status ?? 1;
  if (!hay("docker")) {
    console.error("No hay Terraform ni docker para validar la infraestructura.");
    return 2;
  }
  return spawnSync("docker", ["run", "--rm", "-v", `${RAIZ}/infra:/infra`, "-w", "/infra", "-e", "TF_IN_AUTOMATION=1", `hashicorp/terraform:${VERSION_IMAGEN}`, ...args], { stdio: "inherit" }).status ?? 1;
}

for (const paso of [["fmt", "-check", "-recursive", "-diff"], ["init", "-backend=false", "-input=false"], ["validate"]]) {
  console.log(`\n$ terraform ${paso.join(" ")}`);
  const codigo = terraform(paso);
  if (codigo !== 0) {
    console.error(`\nFalló «terraform ${paso[0]}» (código ${codigo}).`);
    process.exit(codigo);
  }
}
console.log("\nLa infraestructura es válida (fmt, init sin backend y validate). Nada se desplegó ni se consultó en AWS.");
