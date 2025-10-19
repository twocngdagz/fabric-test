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
            // Accept PNG or JPEG base64 data URLs. Validate prefix and allow base64 charset for the payload.
            // Docs: data URL scheme https://developer.mozilla.org/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
            'dataUrl' => ['required', 'string', 'regex:/^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/i'],
            'name' => ['sometimes', 'string', 'max:128'],
        ];
    }
}
