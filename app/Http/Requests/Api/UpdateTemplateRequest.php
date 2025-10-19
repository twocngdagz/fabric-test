<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class UpdateTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            'canvas_width' => ['sometimes', 'integer', 'min:1', 'max:8192'],
            'canvas_height' => ['sometimes', 'integer', 'min:1', 'max:8192'],
            'elements' => ['sometimes', 'array'],
        ];
    }
}

