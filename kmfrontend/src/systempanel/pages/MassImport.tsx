import { UploadOutlined } from '@ant-design/icons';
import { Button, Checkbox, Col, Divider, Layout, Row, Select, Table } from 'antd';
import i18next from 'i18next';
import { Component } from 'react';
import Title from '../components/Title';

import { commandBackend } from '../../utils/socket';

interface MassImportState {
	unused: { checked: boolean; name: string; type: string; series: string; file: string; dupDest?: string }[];
	repositories: string[];
	repository: string;
	type?: 'tags' | 'medias';
	tagType?: number;
}

class MassImport extends Component<unknown, MassImportState> {
	state = {
		unused: [],
		repositories: [],
		repository: null,
		type: undefined,
		tagType: undefined,
	};

	componentDidMount() {
		this.refresh();

		this.setState({
			unused: [
				{
					file: 'WASUTA - PV - Ultra Miracle-cle Final Ultimate Choco Beam.mp4',
					name: 'Ultra Miracle-cle Final Ultimate Choco Beam',
					series: 'WASUTA',
					type: 'PV',
					checked: true,
				},
				{
					file: 'Love Live! Sunshine OP1 - Aqours - Aozora Jumping Heart.mkv',
					name: 'Aozora Jumping Heart',
					type: 'OP',
					checked: true,
					series: 'Love Live! Sunshine',
					dupDest: 'JPN - Love Live! Sunshine!! - OP - Aozora Jumping Heart.mp4',
				},
				{
					file: 'JR East - PV1 - Gono judgment.mp4',
					name: 'Gono judgment',
					type: 'PV',
					series: 'JR East',
					checked: true,
				},
			],
		});
	}

	refresh = async () => {
		const res = await commandBackend('getRepos');
		if (res.length > 0) this.setState({ repository: 'my-repo.moe', repositories: res.map(value => value.Name) });
	};

	changeType = async value => {
		this.setState({ tagType: value });
	};

	deleteMedia = async (file: string) => {
		try {
			await commandBackend('deleteMediaFile', { file: file, repo: this.state.repository });
			this.setState({ unused: this.state.unused.filter(item => item.file !== file) });
		} catch (err) {
			// already display
		}
	};

	deleteTag = async tid => {
		try {
			await commandBackend('deleteTag', { tids: [tid] });
			this.setState({ unused: this.state.unused.filter(item => item.tid !== tid) });
		} catch (err) {
			// already display
		}
	};

	render() {
		return (
			<>
				<Title title="Import karaokes" description="Mass import karaokes to repository" />
				<Divider orientation="left">Source</Divider>
				<Layout.Content>
					<Row style={{ marginBottom: '0.5em', marginLeft: '0.5em' }}>
						{this.state.repositories && this.state.repository ? (
							<Col style={{ paddingRight: '5em', paddingLeft: '110px' }}>
								<label style={{ paddingRight: '15px', width: '150px' }}>Destination repository</label>
								<Select style={{ width: 150 }} defaultValue={this.state.repository}>
									{this.state.repositories.map(repo => {
										return (
											<Select.Option key={repo} value={repo}>
												{repo}
											</Select.Option>
										);
									})}
								</Select>
							</Col>
						) : null}
					</Row>
					<Row style={{ marginBottom: '0.5em', marginLeft: '0.5em' }}>
						<Col style={{ paddingRight: '1em', paddingLeft: '110px' }}>
							<label style={{ paddingRight: '15px', width: '150px', display: 'inline-block' }}>
								Sources
							</label>
							<Button>
								<UploadOutlined /> Select folder or files
							</Button>
						</Col>
						<Col style={{ paddingTop: '4px' }}>E:&#92;AnotherKaraokeBase&#92;</Col>
					</Row>
					<Row>
						<Col style={{ paddingRight: '5em', paddingLeft: '270px' }}>
							<Checkbox checked={true}>Detect duplicates</Checkbox>
						</Col>
					</Row>
					<Row> </Row>
					<Row style={{ marginBottom: '0.5em', marginLeft: '0.5em', marginTop: '20px' }}>
						<Col style={{ paddingRight: '5em', paddingLeft: '110px' }}>
							<label style={{ paddingRight: '15px', width: '150px', display: 'inline-block' }}>
								Filename pattern
							</label>
							<Select
								showSearch
								placeholder="${SERIES}_${SONGTYPE}_${SONGNAME}"
								optionFilterProp="children"
								filterOption={(input, option) =>
									(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
								}
								options={[
									{
										value: 'jack',
										label: 'Jack',
									},
									{
										value: 'lucy',
										label: 'Lucy',
									},
									{
										value: 'tom',
										label: 'Tom',
									},
								]}
							/>
						</Col>
					</Row>
					<Divider orientation="left">Media files</Divider>
					<Row>
						<Col style={{ paddingRight: '5em', paddingLeft: '110px' }}>
							<label>Files to import</label>
							<Table dataSource={this.state.unused} columns={this.columns} rowKey="file" />
						</Col>
					</Row>
					<Row>
						<Col style={{ paddingRight: '5em', paddingLeft: '110px' }}>
							<label>Duplicates</label>
							<Table
								dataSource={this.state.unused.filter(x => x.dupDest)}
								columns={this.columnsDup}
								rowKey="file"
							/>
						</Col>
					</Row>
					<Divider orientation="left">Import</Divider>
					<Row>
						<Col style={{ paddingRight: '5em', paddingLeft: '110px' }}>
							<Button type="primary">Start import</Button>
						</Col>
					</Row>
				</Layout.Content>
			</>
		);
	}

	columns = [
		{
			title: '',
			dataIndex: 'checked',
			key: 'checked',
		},
		{
			title: i18next.t('UNUSED_FILES.FILE'),
			dataIndex: 'file',
			key: 'file',
			sorter: (a, b) => a.file.localeCompare(b.file),
			defaultSortOrder: 'ascend' as const,
		},
		{
			title: 'Name',
			dataIndex: 'name',
			key: 'name',
		},
		{
			title: 'Type',
			dataIndex: 'type',
			key: 'type',
		},
		{
			title: 'Series',
			dataIndex: 'series',
			key: 'series',
		},
	];

	columnsDup = [
		{
			title: 'Import',
			render: i18n_names => {
				return <Checkbox></Checkbox>;
			},
		},
		{
			title: 'Source',
			dataIndex: 'file',
			key: 'file',
		},
		{
			title: 'Existing',
			dataIndex: 'dupDest',
			key: 'dupDest',
		},

		{
			title: 'Repo',
			render: i18n_names => {
				return 'kara.moe';
			},
		},
	];
}

export default MassImport;
