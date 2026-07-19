import { readFile } from "node:fs/promises";
import type { ModelDimensionsMm } from "../shared/modelGeometry.ts";

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

export async function readStlDimensions(filePath: string): Promise<ModelDimensionsMm> {
  const buffer = await readFile(filePath);
  const vertices = looksLikeBinaryStl(buffer)
    ? readBinaryStlVertices(buffer)
    : readAsciiStlVertices(buffer.toString("utf8"));
  if (vertices.length === 0) {
    throw new Error("模型尺寸无法识别，需人工确认。");
  }

  const axes = [0, 1, 2].map((axis) => vertices.map((vertex) => vertex[axis]));
  return {
    x: roundDimension(Math.max(...axes[0]) - Math.min(...axes[0])),
    y: roundDimension(Math.max(...axes[1]) - Math.min(...axes[1])),
    z: roundDimension(Math.max(...axes[2]) - Math.min(...axes[2])),
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

function readBinaryStlVertices(buffer: Buffer): number[][] {
  const triangleCount = buffer.readUInt32LE(80);
  const vertices: number[][] = [];
  for (let index = 0; index < triangleCount; index += 1) {
    const start = 84 + index * 50 + 12;
    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      const offset = start + vertexIndex * 12;
      vertices.push([
        buffer.readFloatLE(offset),
        buffer.readFloatLE(offset + 4),
        buffer.readFloatLE(offset + 8),
      ]);
    }
  }
  return vertices.filter((vertex) => vertex.every(Number.isFinite));
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

function readAsciiStlVertices(source: string): number[][] {
  return [...source.matchAll(/vertex\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/gi)]
    .map((match) => [Number(match[1]), Number(match[2]), Number(match[3])])
    .filter((vertex) => vertex.every(Number.isFinite));
}

function roundDimension(value: number) {
  return Math.round(value * 1000) / 1000;
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
