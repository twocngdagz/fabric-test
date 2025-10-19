<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class ExportImageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'dataUrl' => ['required', 'string', 'regex:/^data:image\\/png;base64,[A-Za-z0-9+\/=]+$/'],
            'name' => ['sometimes', 'string', 'max:120'],
        ];
    }
}

