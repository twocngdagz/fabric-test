<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\ExportImageRequest;
use Illuminate\Support\Str;

class ExportController extends Controller
{
    public function store(ExportImageRequest $request)
    {
        $dataUrl = (string) $request->string('dataUrl');
        $providedName = $request->string('name')->toString();

        // Expected header: data:image/{png|jpeg};base64,ENCODED
        if (!preg_match('#^data:image\/(png|jpeg);base64,#i', $dataUrl, $m)) {
            return response()->json(['message' => 'Unsupported image format'], 422);
        }
        $mime = strtolower($m[1]); // 'png' or 'jpeg'
        $extFromMime = $mime === 'png' ? 'png' : 'jpg'; // normalize jpeg -> jpg

        // Split header and base64 body
        [$header, $b64] = explode(',', $dataUrl, 2);

        $binary = base64_decode($b64, true);
        if ($binary === false) {
            return response()->json(['message' => 'Invalid image data'], 422);
        }

        $dir = public_path('exports');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        // If client provided a name, trust its extension when valid; otherwise infer from MIME
        $filename = null;
        if ($providedName !== '') {
            // Remove any path components and sanitize base name
            $base = pathinfo($providedName, PATHINFO_FILENAME);
            $ext = strtolower(pathinfo($providedName, PATHINFO_EXTENSION));
            // slug the base to avoid unsafe characters but allow short readable names
            $safeBase = trim(Str::slug($base));
            if ($safeBase === '') {
                $safeBase = 'photobooth-'.now()->format('Ymd_His');
            }
            if (in_array($ext, ['png', 'jpg', 'jpeg'], true)) {
                $safeExt = $ext === 'jpeg' ? 'jpg' : $ext; // normalize
            } else {
                $safeExt = $extFromMime; // no/invalid extension -> infer from MIME
            }
            $filename = $safeBase.'.'.$safeExt;
        } else {
            $filename = 'photobooth-'.now()->format('Ymd_His').'.'.$extFromMime;
        }

        file_put_contents($dir.DIRECTORY_SEPARATOR.$filename, $binary);

        $url = url('/exports/'.$filename);

        return response()->json(['url' => $url]);
    }
}
