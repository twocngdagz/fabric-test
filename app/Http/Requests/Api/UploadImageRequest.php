<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class UploadImageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // max is in kilobytes; 10MB = 10240 KB
        return [
            'image' => ['required', 'file', 'mimes:jpeg,jpg,png', 'max:10240'],
        ];
    }
}

