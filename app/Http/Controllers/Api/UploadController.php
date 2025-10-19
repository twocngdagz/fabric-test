<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\UploadImageRequest;
use Illuminate\Support\Str;

class UploadController extends Controller
{
    public function store(UploadImageRequest $request)
    {
        $file = $request->file('image');

        $dir = public_path('uploads');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $mime = $file->getMimeType();
        $ext = match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            default => $file->extension(),
        };

        $filename = Str::uuid()->toString().'.'.$ext;
        $file->move($dir, $filename);

        $url = url('/uploads/'.$filename);

        return response()->json(['url' => $url]);
    }
}

