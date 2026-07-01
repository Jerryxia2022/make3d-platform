import { readFile } from "node:fs/promises";

export type StlTopologyAnalysis = {
  componentCount: number;
  triangleCount: number;
};

const MAX_ANALYSIS_TRIANGLES = 120_000;

type Triangle = [string, string, string];

export async function analyzeStlTopology(filePath: string): Promise<StlTopologyAnalysis> {
  const buffer = await readFile(filePath);
  const triangles = parseStlTriangles(buffer);

  if (triangles.length === 0) {
    throw new Error("模型网格异常，需要人工确认后报价。");
  }

  if (triangles.length > MAX_ANALYSIS_TRIANGLES) {
    return { componentCount: 1, triangleCount: triangles.length };
  }

  return {
    componentCount: countConnectedComponents(triangles),
    triangleCount: triangles.length,
  };
}

function parseStlTriangles(buffer: Buffer): Triangle[] {
  if (looksLikeBinaryStl(buffer)) {
    return parseBinaryStlTriangles(buffer);
  }

  return parseAsciiStlTriangles(buffer.toString("utf8"));
}

function looksLikeBinaryStl(buffer: Buffer) {
  if (buffer.length < 84) {
    return false;
  }

  const triangleCount = buffer.readUInt32LE(80);
  return 84 + triangleCount * 50 === buffer.length;
}

function parseBinaryStlTriangles(buffer: Buffer): Triangle[] {
  const triangleCount = buffer.readUInt32LE(80);
  const triangles: Triangle[] = [];

  for (let index = 0; index < triangleCount; index += 1) {
    const offset = 84 + index * 50 + 12;
    triangles.push([
      readVertexKey(buffer, offset),
      readVertexKey(buffer, offset + 12),
      readVertexKey(buffer, offset + 24),
    ]);
  }

  return triangles;
}

function readVertexKey(buffer: Buffer, offset: number) {
  return [
    normalizeCoordinate(buffer.readFloatLE(offset)),
    normalizeCoordinate(buffer.readFloatLE(offset + 4)),
    normalizeCoordinate(buffer.readFloatLE(offset + 8)),
  ].join(",");
}

function parseAsciiStlTriangles(source: string): Triangle[] {
  const vertices = [...source.matchAll(/vertex\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/gi)]
    .map((match) =>
      [
        normalizeCoordinate(Number(match[1])),
        normalizeCoordinate(Number(match[2])),
        normalizeCoordinate(Number(match[3])),
      ].join(","),
    );
  const triangles: Triangle[] = [];

  for (let index = 0; index + 2 < vertices.length; index += 3) {
    triangles.push([vertices[index], vertices[index + 1], vertices[index + 2]]);
  }

  return triangles;
}

function countConnectedComponents(triangles: Triangle[]) {
  const parent = Array.from({ length: triangles.length }, (_, index) => index);
  const vertexToTriangle = new Map<string, number>();

  triangles.forEach((triangle, triangleIndex) => {
    for (const vertex of triangle) {
      const previousTriangle = vertexToTriangle.get(vertex);

      if (previousTriangle == null) {
        vertexToTriangle.set(vertex, triangleIndex);
      } else {
        union(parent, triangleIndex, previousTriangle);
      }
    }
  });

  return new Set(parent.map((_, index) => find(parent, index))).size;
}

function union(parent: number[], left: number, right: number) {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);

  if (leftRoot !== rightRoot) {
    parent[rightRoot] = leftRoot;
  }
}

function find(parent: number[], index: number): number {
  if (parent[index] !== index) {
    parent[index] = find(parent, parent[index]);
  }

  return parent[index];
}

function normalizeCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(5) : "NaN";
}
