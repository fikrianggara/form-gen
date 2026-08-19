import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(request: Request) {
  try {
    const filePath = join(process.cwd(), 'docs', 'openapi.yaml');
    const fileContents = readFileSync(filePath, 'utf8');

    return new NextResponse(fileContents, {
      headers: {
        'Content-Type': 'text/yaml',
        // Optional: add cache headers if needed, e.g.,
        // 'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'OpenAPI specification not found' }, { status: 404 });
  }
}
