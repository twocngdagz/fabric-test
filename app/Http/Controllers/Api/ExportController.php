<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\ExportImageRequest;
use Illuminate\Support\Str;

class ExportController extends Controller
{
    public function store(ExportImageRequest $request)
    {
        $dataUrl = $request->string('dataUrl');
        $name = $request->string('name')->toString();

        // Expected format: data:image/png;base64,XXXX
        [$header, $b64] = explode(',', $dataUrl, 2);

        $binary = base64_decode($b64, true);
        if ($binary === false) {
            return response()->json(['message' => 'Invalid image data'], 422);
        }

        $dir = public_path('exports');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $basename = $name !== '' ? Str::slug($name) : null;
        $filename = ($basename ?: now()->format('Ymd_His')).'.png';

        file_put_contents($dir.DIRECTORY_SEPARATOR.$filename, $binary);

        $url = url('/exports/'.$filename);

        return response()->json(['url' => $url]);
    }
}

