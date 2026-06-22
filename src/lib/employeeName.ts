// Utilitários de nome do colaborador.
// Os campos `first_name`, `second_name`, `last_name` NÃO podem conter espaços
// (cada um deve ser uma palavra única). `nickname` é livre.

export const NO_SPACE_REGEX = /^\S*$/;

export function validateNoSpaces(value: string): boolean {
  return NO_SPACE_REGEX.test(value ?? "");
}

export function sanitizeNoSpaces(value: string): string {
  return (value ?? "").replace(/\s+/g, "");
}

export function composeFullName(parts: {
  first_name?: string | null;
  second_name?: string | null;
  last_name?: string | null;
}): string {
  return [parts.first_name, parts.second_name, parts.last_name]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function splitFullName(name: string): {
  first_name: string;
  second_name: string;
  last_name: string;
} {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", second_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], second_name: "", last_name: "" };
  if (parts.length === 2) return { first_name: parts[0], second_name: "", last_name: parts[1] };
  return {
    first_name: parts[0],
    second_name: parts[1],
    last_name: parts[parts.length - 1],
  };
}
